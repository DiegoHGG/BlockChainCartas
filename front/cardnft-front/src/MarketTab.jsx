import { useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";

/**
 * MarketTab
 * - Listar NFT por ETH nativo (wei)
 * - Cancelar listing
 * - Comprar (envía msg.value)
 * - Approve / setApprovalForAll para que el Market pueda transferir
 *
 * Props:
 * - provider: ethers.BrowserProvider
 * - account: string
 * - nftAddress: address del CardNFT
 * - marketAddress: address del CardNFTMarketNative
 * - onStatus: (msg: string) => void
 */
export default function MarketTab({
  provider,
  account,
  nftAddress,
  marketAddress,
  onStatus,
}) {
  const [marketWrite, setMarketWrite] = useState(null);
  const [nftWrite, setNftWrite] = useState(null);

  const [tokenId, setTokenId] = useState("1");
  const [priceEth, setPriceEth] = useState("0.01"); // en ETH (UI), se convierte a wei

  const [listingInfo, setListingInfo] = useState(null);
  const [approvalInfo, setApprovalInfo] = useState(null);

  const hasProvider = !!provider;

  const NFT_ABI = useMemo(
    () => [
      "function ownerOf(uint256 tokenId) view returns (address)",
      "function approve(address to,uint256 tokenId)",
      "function getApproved(uint256 tokenId) view returns (address)",
      "function setApprovalForAll(address operator,bool approved)",
      "function isApprovedForAll(address owner,address operator) view returns (bool)",
    ],
    []
  );

  const MARKET_ABI = useMemo(
    () => [
      "function listings(uint256 tokenId) view returns (address seller,uint256 price)",
      "function list(uint256 tokenId,uint256 price)",
      "function cancel(uint256 tokenId)",
      "function buy(uint256 tokenId) payable",
      "event Listed(uint256 indexed tokenId,address indexed seller,uint256 price)",
      "event Cancelled(uint256 indexed tokenId,address indexed seller)",
      "event Bought(uint256 indexed tokenId,address indexed buyer,address indexed seller,uint256 price)",
    ],
    []
  );

  const nftRead = useMemo(() => {
    if (!hasProvider || !nftAddress) return null;
    return new ethers.Contract(nftAddress, NFT_ABI, provider);
  }, [hasProvider, nftAddress, NFT_ABI, provider]);

  const marketRead = useMemo(() => {
    if (!hasProvider || !marketAddress) return null;
    return new ethers.Contract(marketAddress, MARKET_ABI, provider);
  }, [hasProvider, marketAddress, MARKET_ABI, provider]);

  // Crear contratos de escritura cuando hay provider + cuenta
  useEffect(() => {
    let cancelled = false;

    async function setupWrite() {
      try {
        if (!provider || !account || !nftAddress || !marketAddress) {
          setMarketWrite(null);
          setNftWrite(null);
          return;
        }
        const signer = await provider.getSigner();
        if (cancelled) return;

        setNftWrite(new ethers.Contract(nftAddress, NFT_ABI, signer));
        setMarketWrite(new ethers.Contract(marketAddress, MARKET_ABI, signer));
      } catch (e) {
        console.error("setupWrite error:", e);
        setMarketWrite(null);
        setNftWrite(null);
      }
    }

    setupWrite();
    return () => {
      cancelled = true;
    };
  }, [provider, account, nftAddress, marketAddress, NFT_ABI, MARKET_ABI]);

  function setStatus(msg) {
    if (onStatus) onStatus(msg);
  }

  const tokenIdBig = useMemo(() => {
    try {
      return BigInt(tokenId || "0");
    } catch {
      return 0n;
    }
  }, [tokenId]);

  // ---------------------------
  // Helpers
  // ---------------------------
  async function refreshListing() {
    try {
      if (!marketRead) {
        setStatus("❌ Market (read) no listo.");
        return;
      }
      setStatus("Leyendo listing...");
      const [seller, priceWei] = await marketRead.listings(tokenIdBig);
      const isListed = seller && seller !== ethers.ZeroAddress;

      setListingInfo({
        tokenId: tokenIdBig.toString(),
        seller,
        priceWei: priceWei?.toString?.() ?? String(priceWei),
        priceEth: priceWei ? ethers.formatEther(priceWei) : "0",
        isListed,
      });

      setStatus("✅ Listing leído.");
    } catch (e) {
      console.error("refreshListing error:", e);
      setListingInfo(null);
      setStatus(`❌ Error leyendo listing: ${e?.shortMessage ?? e?.message ?? e}`);
    }
  }

  async function refreshApproval() {
    try {
      if (!nftRead || !account) {
        setStatus("❌ NFT (read) no listo o no hay cuenta.");
        return;
      }
      setStatus("Leyendo approvals...");
      const approved = await nftRead.getApproved(tokenIdBig);
      const approvedForAll = await nftRead.isApprovedForAll(account, marketAddress);

      setApprovalInfo({
        tokenId: tokenIdBig.toString(),
        approved,
        approvedForAll,
        marketAddress,
      });

      setStatus("✅ Approvals leídos.");
    } catch (e) {
      console.error("refreshApproval error:", e);
      setApprovalInfo(null);
      setStatus(`❌ Error leyendo approvals: ${e?.shortMessage ?? e?.message ?? e}`);
    }
  }

  async function approveToken() {
    try {
      if (!nftWrite) {
        setStatus("❌ Conecta MetaMask (no signer).");
        return;
      }
      setStatus("📝 Firmando approve...");
      const tx = await nftWrite.approve(marketAddress, tokenIdBig);
      setStatus("⏳ Approve enviado, esperando confirmación...");
      await tx.wait();
      setStatus("✅ Approve confirmado.");
      await refreshApproval();
    } catch (e) {
      console.error("approveToken error:", e);
      setStatus(`❌ Error approve: ${e?.shortMessage ?? e?.message ?? e}`);
    }
  }

  async function setApprovalForAllTrue() {
    try {
      if (!nftWrite) {
        setStatus("❌ Conecta MetaMask (no signer).");
        return;
      }
      setStatus("📝 Firmando setApprovalForAll(true)...");
      const tx = await nftWrite.setApprovalForAll(marketAddress, true);
      setStatus("⏳ setApprovalForAll enviado, esperando confirmación...");
      await tx.wait();
      setStatus("✅ setApprovalForAll confirmado.");
      await refreshApproval();
    } catch (e) {
      console.error("setApprovalForAllTrue error:", e);
      setStatus(`❌ Error setApprovalForAll: ${e?.shortMessage ?? e?.message ?? e}`);
    }
  }

  async function listForSale() {
    try {
      if (!marketWrite) {
        setStatus("❌ Conecta MetaMask (no signer).");
        return;
      }
      const wei = ethers.parseEther(priceEth || "0");
      if (wei <= 0n) {
        setStatus("❌ Precio inválido.");
        return;
      }

      setStatus("📝 Firmando list()...");
      const tx = await marketWrite.list(tokenIdBig, wei);
      setStatus("⏳ Listing enviado, esperando confirmación...");
      await tx.wait();
      setStatus("✅ Listing confirmado.");
      await refreshListing();
    } catch (e) {
      console.error("listForSale error:", e);
      setStatus(`❌ Error list: ${e?.shortMessage ?? e?.message ?? e}`);
    }
  }

  async function cancelListing() {
    try {
      if (!marketWrite) {
        setStatus("❌ Conecta MetaMask (no signer).");
        return;
      }
      setStatus("📝 Firmando cancel()...");
      const tx = await marketWrite.cancel(tokenIdBig);
      setStatus("⏳ Cancel enviado, esperando confirmación...");
      await tx.wait();
      setStatus("✅ Cancel confirmado.");
      await refreshListing();
    } catch (e) {
      console.error("cancelListing error:", e);
      setStatus(`❌ Error cancel: ${e?.shortMessage ?? e?.message ?? e}`);
    }
  }

  async function buyToken() {
    try {
      if (!marketWrite) {
        setStatus("❌ Conecta MetaMask (no signer).");
        return;
      }
      // Necesitamos precio desde el listing
      if (!listingInfo?.isListed) {
        setStatus("❌ No hay listing (lee listing primero).");
        return;
      }

      const value = BigInt(listingInfo.priceWei);
      setStatus("📝 Firmando buy() (enviando ETH nativo)...");
      const tx = await marketWrite.buy(tokenIdBig, { value });
      setStatus("⏳ Buy enviado, esperando confirmación...");
      await tx.wait();
      setStatus("✅ Compra confirmada.");
      await refreshListing();
      await refreshApproval();
    } catch (e) {
      console.error("buyToken error:", e);
      setStatus(`❌ Error buy: ${e?.shortMessage ?? e?.message ?? e}`);
    }
  }

  // Auto-refresh si cambia tokenId/cuenta
  useEffect(() => {
    if (!marketRead || !nftRead) return;
    refreshListing();
    refreshApproval();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marketRead, nftRead, tokenIdBig, account]);

  const listingBox = (
    <div style={{ padding: 12, borderRadius: 12, border: "1px solid #eee", background: "#fafafa" }}>
      {!listingInfo ? (
        <div style={{ opacity: 0.7 }}>Sin listing cargado.</div>
      ) : (
        <>
          <div><b>tokenId:</b> {listingInfo.tokenId}</div>
          <div><b>listed:</b> {listingInfo.isListed ? "✅ sí" : "❌ no"}</div>
          <div><b>seller:</b> {listingInfo.isListed ? listingInfo.seller : "-"}</div>
          <div><b>price (wei):</b> {listingInfo.isListed ? listingInfo.priceWei : "-"}</div>
          <div><b>price (ETH):</b> {listingInfo.isListed ? listingInfo.priceEth : "-"}</div>
        </>
      )}
    </div>
  );

  const approvalBox = (
    <div style={{ padding: 12, borderRadius: 12, border: "1px solid #eee", background: "#fafafa" }}>
      {!approvalInfo ? (
        <div style={{ opacity: 0.7 }}>Sin approvals cargados.</div>
      ) : (
        <>
          <div><b>tokenId:</b> {approvalInfo.tokenId}</div>
          <div><b>getApproved(tokenId):</b> {approvalInfo.approved}</div>
          <div><b>isApprovedForAll(owner, market):</b> {String(approvalInfo.approvedForAll)}</div>
          <div style={{ marginTop: 6, opacity: 0.75 }}>
            💡 Para que el market pueda transferir: <br />
            - o <code>approve(market, tokenId)</code> <br />
            - o <code>setApprovalForAll(market, true)</code>
          </div>
        </>
      )}
    </div>
  );

  return (
    <div style={{ padding: 14, border: "1px solid #ddd", borderRadius: 14 }}>
      <h2 style={{ marginTop: 0 }}>Compra / Venta (Market)</h2>

      <div style={{ marginBottom: 10, opacity: 0.8 }}>
        <div><b>NFT:</b> <code>{nftAddress || "-"}</code></div>
        <div><b>Market:</b> <code>{marketAddress || "-"}</code></div>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <label>
          TokenId:&nbsp;
          <input
            value={tokenId}
            onChange={(e) => setTokenId(e.target.value)}
            style={{ padding: 8, width: 140 }}
          />
        </label>

        <label>
          Precio (ETH):&nbsp;
          <input
            value={priceEth}
            onChange={(e) => setPriceEth(e.target.value)}
            style={{ padding: 8, width: 140 }}
          />
        </label>

        <button onClick={refreshListing} style={{ padding: "10px 14px", cursor: "pointer" }}>
          Leer listing
        </button>
        <button onClick={refreshApproval} style={{ padding: "10px 14px", cursor: "pointer" }}>
          Leer approvals
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
        {listingBox}
        {approvalBox}
      </div>

      <hr style={{ margin: "18px 0" }} />

      <h3 style={{ margin: "0 0 10px 0" }}>Acciones</h3>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button onClick={approveToken} style={{ padding: "10px 14px", cursor: "pointer" }}>
          approve(market, tokenId)
        </button>

        <button onClick={setApprovalForAllTrue} style={{ padding: "10px 14px", cursor: "pointer" }}>
          setApprovalForAll(market, true)
        </button>

        <button onClick={listForSale} style={{ padding: "10px 14px", cursor: "pointer" }}>
          list(tokenId, price)
        </button>

        <button onClick={cancelListing} style={{ padding: "10px 14px", cursor: "pointer" }}>
          cancel(tokenId)
        </button>

        <button onClick={buyToken} style={{ padding: "10px 14px", cursor: "pointer" }}>
          buy(tokenId) (envía ETH)
        </button>
      </div>

      <div style={{ marginTop: 10, opacity: 0.75 }}>
        ⚠️ Si <code>list</code> o <code>buy</code> fallan: normalmente falta <b>approve</b> o estás en la red equivocada.
      </div>
    </div>
  );
}
