// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

interface ICardState {
    function estadoOf(uint256 tokenId) external view returns (uint8 estado, uint64 updatedAt);
}

interface IAccessControl {
    function hasRole(bytes32 role, address account) external view returns (bool);
}

contract CardNFTMarketNative is ReentrancyGuard {
    IERC721 public immutable nft;

    bytes32 public constant INSPECTOR_ROLE = keccak256("INSPECTOR_ROLE");

struct PendingListing {
    address seller;
    uint256 price;
    uint64 requestedAt;
}

mapping(uint256 => PendingListing) public pendingListings;

event ListingRequested(uint256 indexed tokenId, address indexed seller, uint256 price);
event ListingFinalized(uint256 indexed tokenId, address indexed inspector, address indexed seller, uint256 price, uint8 estado);

    // ----------------------------
    // LISTINGS (venta por ETH)
    // ----------------------------
    struct Listing {
        address seller;
        uint256 price; // wei
    }

    mapping(uint256 => Listing) public listings;

    event Listed(uint256 indexed tokenId, address indexed seller, uint256 price);
    event Cancelled(uint256 indexed tokenId, address indexed seller);
    event Bought(uint256 indexed tokenId, address indexed buyer, address indexed seller, uint256 price);

    // ----------------------------
    // SWAPS (NFT <-> NFT)
    // ----------------------------
    struct SwapOffer {
        address maker;          // quien crea la oferta
        uint256 offeredTokenId; // token que ofrece
        uint256 wantedTokenId;  // token que quiere a cambio
        bool active;
    }

    // 1 oferta por token ofrecido (modelo simple)
    mapping(uint256 => SwapOffer) public swapOffers;

    event SwapOffered(address indexed maker, uint256 indexed offeredTokenId, uint256 indexed wantedTokenId);
    event SwapCancelled(address indexed maker, uint256 indexed offeredTokenId);
    event SwapAccepted(
        address indexed taker,
        address indexed maker,
        uint256 indexed offeredTokenId,
        uint256 wantedTokenId
    );

    constructor(address nftAddress) {
        require(nftAddress != address(0), "zero addr");
        nft = IERC721(nftAddress);
    }

    // ============================
    // Helpers
    // ============================
    function _isApprovedOrOwner(address owner, uint256 tokenId) internal view returns (bool) {
        // Para ERC721 estándar:
        // - getApproved(tokenId) == address(this)
        // - isApprovedForAll(owner, address(this)) == true
        //
        // IERC721 incluye estas funciones, así que podemos usarlas.
        return (nft.getApproved(tokenId) == address(this) || nft.isApprovedForAll(owner, address(this)));
    }

    // ============================
    // Venta por ETH
    // ============================
 function list(uint256 tokenId, uint256 price) external {
    require(price > 0, "price=0");
    require(nft.ownerOf(tokenId) == msg.sender, "not owner");
    require(_isApprovedOrOwner(msg.sender, tokenId), "market not approved");

    require(listings[tokenId].seller == address(0), "already listed");
    require(pendingListings[tokenId].seller == address(0), "already pending");

    pendingListings[tokenId] = PendingListing({
        seller: msg.sender,
        price: price,
        requestedAt: uint64(block.timestamp)
    });

    emit ListingRequested(tokenId, msg.sender, price);
}


function finalizeListing(uint256 tokenId) external {
    PendingListing memory p = pendingListings[tokenId];
    require(p.seller != address(0), "not pending");

    // Solo inspector (role sul contratto NFT)
    require(IAccessControl(address(nft)).hasRole(INSPECTOR_ROLE, msg.sender), "not inspector");

    // seller ancora owner e market approvato
    require(nft.ownerOf(tokenId) == p.seller, "seller no longer owner");
    require(_isApprovedOrOwner(p.seller, tokenId), "market not approved");

    // Deve essere ispezionata (estado != UNKNOWN)
    (uint8 estado, ) = ICardState(address(nft)).estadoOf(tokenId);
    require(estado != 0, "token not inspected yet");

    delete pendingListings[tokenId];
    listings[tokenId] = Listing({ seller: p.seller, price: p.price });

    emit ListingFinalized(tokenId, msg.sender, p.seller, p.price, estado);
    emit Listed(tokenId, p.seller, p.price);
}



 function cancel(uint256 tokenId) external {
    Listing memory l = listings[tokenId];

    if (l.seller != address(0)) {
        require(l.seller == msg.sender, "not seller");
        delete listings[tokenId];
        emit Cancelled(tokenId, msg.sender);
        return;
    }

    PendingListing memory p = pendingListings[tokenId];
    require(p.seller != address(0), "not listed");
    require(p.seller == msg.sender, "not seller");
    delete pendingListings[tokenId];
    emit Cancelled(tokenId, msg.sender);
}


    function buy(uint256 tokenId) external payable nonReentrant {
        Listing memory l = listings[tokenId];
        require(l.seller != address(0), "not listed");
        require(nft.ownerOf(tokenId) == l.seller, "seller no longer owner");
        require(msg.sender != l.seller, "self buy");
        require(msg.value == l.price, "wrong value");
        // aseguramos que el market puede transferir
        require(_isApprovedOrOwner(l.seller, tokenId), "market not approved");

        // efectos primero
        delete listings[tokenId];

        // 1) pagas al seller
        (bool ok, ) = payable(l.seller).call{ value: msg.value }("");
        require(ok, "payment failed");

        // 2) transfieres NFT
        nft.safeTransferFrom(l.seller, msg.sender, tokenId);

        emit Bought(tokenId, msg.sender, l.seller, msg.value);
    }

    // ============================
    // Swap NFT <-> NFT
    // ============================
    function offerSwap(uint256 offeredTokenId, uint256 wantedTokenId) external {
        require(offeredTokenId != wantedTokenId, "same token");
        require(nft.ownerOf(offeredTokenId) == msg.sender, "not owner offered");
        // recomendado: exigir approval al crear la oferta (evita ofertas “fake”)
        require(_isApprovedOrOwner(msg.sender, offeredTokenId), "market not approved offered");

        // (Opcional) Evitar que ofrezcas un token que está listado en venta
        // si quieres permitir ambos, quita esto.
        require(listings[offeredTokenId].seller == address(0), "offered token listed");

        swapOffers[offeredTokenId] = SwapOffer({
            maker: msg.sender,
            offeredTokenId: offeredTokenId,
            wantedTokenId: wantedTokenId,
            active: true
        });

        emit SwapOffered(msg.sender, offeredTokenId, wantedTokenId);
    }

    function cancelSwap(uint256 offeredTokenId) external {
        SwapOffer memory o = swapOffers[offeredTokenId];
        require(o.active, "not active");
        require(o.maker == msg.sender, "not maker");

        delete swapOffers[offeredTokenId];
        emit SwapCancelled(msg.sender, offeredTokenId);
    }

    function acceptSwap(uint256 offeredTokenId) external nonReentrant {
        SwapOffer memory o = swapOffers[offeredTokenId];
        require(o.active, "not active");

        // checks de ownership actuales
        require(nft.ownerOf(o.offeredTokenId) == o.maker, "maker not owner now");
        require(nft.ownerOf(o.wantedTokenId) == msg.sender, "taker not owner wanted");

        // checks de approvals para poder transferir ambos tokens
        require(_isApprovedOrOwner(o.maker, o.offeredTokenId), "market not approved offered");
        require(_isApprovedOrOwner(msg.sender, o.wantedTokenId), "market not approved wanted");

        // (Opcional) Evitar aceptar swap si alguno está listado en venta
        require(listings[o.offeredTokenId].seller == address(0), "offered token listed");
        require(listings[o.wantedTokenId].seller == address(0), "wanted token listed");

        // efectos primero
        delete swapOffers[offeredTokenId];

        // intercambio atómico: si cualquiera revierte, toda la tx revierte
        nft.safeTransferFrom(o.maker, msg.sender, o.offeredTokenId);
        nft.safeTransferFrom(msg.sender, o.maker, o.wantedTokenId);

        emit SwapAccepted(msg.sender, o.maker, o.offeredTokenId, o.wantedTokenId);
    }
}
