// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract CardNFTMarketNative is ReentrancyGuard {
    IERC721 public immutable nft;

    struct Listing {
        address seller;
        uint256 price; // en ETHLab nativo (wei)
    }

    mapping(uint256 => Listing) public listings;

    event Listed(uint256 indexed tokenId, address indexed seller, uint256 price);
    event Cancelled(uint256 indexed tokenId, address indexed seller);
    event Bought(uint256 indexed tokenId, address indexed buyer, address indexed seller, uint256 price);

    constructor(address nftAddress) {
        require(nftAddress != address(0), "zero addr");
        nft = IERC721(nftAddress);
    }

    function list(uint256 tokenId, uint256 price) external {
        require(price > 0, "price=0");
        require(nft.ownerOf(tokenId) == msg.sender, "not owner");

        listings[tokenId] = Listing({ seller: msg.sender, price: price });
        emit Listed(tokenId, msg.sender, price);
    }

    function cancel(uint256 tokenId) external {
        Listing memory l = listings[tokenId];
        require(l.seller != address(0), "not listed");
        require(l.seller == msg.sender, "not seller");

        delete listings[tokenId];
        emit Cancelled(tokenId, msg.sender);
    }

    function buy(uint256 tokenId) external payable nonReentrant {
        Listing memory l = listings[tokenId];
        require(l.seller != address(0), "not listed");
        require(nft.ownerOf(tokenId) == l.seller, "seller no longer owner");
        require(msg.sender != l.seller, "self buy");
        require(msg.value == l.price, "wrong value");

        // efectos primero
        delete listings[tokenId];

        // 1) pagas al seller
        (bool ok, ) = payable(l.seller).call{value: msg.value}("");
        require(ok, "payment failed");

        // 2) transfieres NFT
        nft.safeTransferFrom(l.seller, msg.sender, tokenId);

        emit Bought(tokenId, msg.sender, l.seller, msg.value);
    }
}
