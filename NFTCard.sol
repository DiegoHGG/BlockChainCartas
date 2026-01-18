// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

contract CardNFT is ERC721, ERC721Enumerable, AccessControl {
    bytes32 public constant MINTER_ROLE    = keccak256("MINTER_ROLE");
    bytes32 public constant INSPECTOR_ROLE = keccak256("INSPECTOR_ROLE");

    enum Estado {
        UNKNOWN,   // 0
        POOR,      // 1
        PLAYED,    // 2
        GOOD,      // 3
        NEAR_MINT, // 4
        MINT,      // 5
        GRADED     // 6
    }

    struct CardData {
        string juego;
        string expansion;
        uint256 numero;
        string rareza;
        Estado estado;
        uint64 updatedAt;
    }


mapping(uint256 => bool) public inspectionRequested;

event InspectionRequested(uint256 indexed tokenId, address indexed owner);
event InspectionCompleted(uint256 indexed tokenId, address indexed inspector, uint8 nuevoEstado);


    mapping(uint256 => CardData) private _cardData;

    uint256 public nextTokenId = 1;

    event CardMinted(
        uint256 indexed tokenId,
        address indexed to,
        string juego,
        string expansion,
        uint256 numero,
        string rareza,
        Estado estadoInicial
    );

    event EstadoUpdated(
        uint256 indexed tokenId,
        address indexed operator,
        Estado estadoAnterior,
        Estado estadoNuevo,
        uint256 timestamp
    );

    constructor() ERC721("CardNFT", "CNFT") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MINTER_ROLE, msg.sender);
        _grantRole(INSPECTOR_ROLE, msg.sender);
    }

    // --- Mint con estado inicial ---
    function mintCard(
        address to,
        string calldata juego,
        string calldata expansion,
        uint256 numero,
        string calldata rareza,
        Estado estadoInicial
    ) external returns (uint256 tokenId) {
        require(to != address(0), "to=0");

        tokenId = nextTokenId++;
        _safeMint(to, tokenId);

        _cardData[tokenId] = CardData({
            juego: juego,
            expansion: expansion,
            numero: numero,
            rareza: rareza,
            estado: estadoInicial,
            updatedAt: uint64(block.timestamp)
        });

        emit CardMinted(tokenId, to, juego, expansion, numero, rareza, estadoInicial);
    }

    // --- Lectura completa ---
    function getCard(uint256 tokenId)
        external
        view
        returns (
            address owner,
            string memory juego,
            string memory expansion,
            uint256 numero,
            string memory rareza,
            Estado estado,
            uint64 updatedAt
        )
    {
        address cardOwner = ownerOf(tokenId); // revierte si no existe
        CardData storage c = _cardData[tokenId];

        return (cardOwner, c.juego, c.expansion, c.numero, c.rareza, c.estado, c.updatedAt);
    }


    // --- Lectura estado ---
    function estadoOf(uint256 tokenId) external view returns (Estado, uint64) {
        ownerOf(tokenId); // revierte si no existe
        return (_cardData[tokenId].estado, _cardData[tokenId].updatedAt);
    }

    /**
     * Cambiar estado:
     * - owner del token
     * - o INSPECTOR_ROLE
     */
    function updateEstado(uint256 tokenId, Estado nuevoEstado) external {
        address owner = ownerOf(tokenId);

        bool isOwner = (msg.sender == owner);
        bool isInspector = hasRole(INSPECTOR_ROLE, msg.sender);

        require(isOwner || isInspector, "not authorized");

        Estado anterior = _cardData[tokenId].estado;
        _cardData[tokenId].estado = nuevoEstado;
        _cardData[tokenId].updatedAt = uint64(block.timestamp);

        if (isInspector) {
        inspectionRequested[tokenId] = false;
        emit InspectionCompleted(tokenId, msg.sender, uint8(nuevoEstado));
    }

        emit EstadoUpdated(tokenId, msg.sender, anterior, nuevoEstado, block.timestamp);
    }


    function requestInspection(uint256 tokenId) external {
    require(ownerOf(tokenId) == msg.sender, "not owner");
    inspectionRequested[tokenId] = true;
    emit InspectionRequested(tokenId, msg.sender);
}


    // Admin puede forzar cambios
    function adminUpdateEstado(uint256 tokenId, Estado nuevoEstado)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        ownerOf(tokenId);

        Estado anterior = _cardData[tokenId].estado;
        _cardData[tokenId].estado = nuevoEstado;
        _cardData[tokenId].updatedAt = uint64(block.timestamp);

        emit EstadoUpdated(tokenId, msg.sender, anterior, nuevoEstado, block.timestamp);
    }

    // ============================
    // Overrides necesarios por ERC721Enumerable (OpenZeppelin v5)
    // ============================

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC721Enumerable, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    function _update(address to, uint256 tokenId, address auth)
        internal
        override(ERC721, ERC721Enumerable)
        returns (address)
    {
        return super._update(to, tokenId, auth);
    }

    function _increaseBalance(address account, uint128 value)
        internal
        override(ERC721, ERC721Enumerable)
    {
        super._increaseBalance(account, value);
    }
}
