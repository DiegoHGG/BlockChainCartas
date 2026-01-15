import { useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import styles from "./SwapTab.module.css";

export default function SwapTab({ provider, account, nftAddress, marketAddress, onStatus }) {
  const [marketWrite, setMarketWrite] = useState(null);
  const [nftWrite, setNftWrite] = useState(null);

  const [offeredTokenId, setOfferedTokenId] = useState("1");
  const [wantedTokenId, setWantedTokenId] = useState("2");

  const [offerInfo, setOfferInfo] = useState(null);
  const [approvalOffered, setApprovalOffered] = useState(null);
  const [approvalWanted, setApprovalWanted] = useState(null);

  function setStatus(msg) {
    if (onStatus) onStatus(msg);
  }

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
      "function offerSwap(uint256 offeredTokenId,uint256 wantedTokenId)",
      "function cancelSwap(uint256 offeredTokenId)",
      "function acceptSwap(uint256 offeredTokenId)",
      "function swapOffers(uint256 offeredTokenId) view returns (address maker,uint256 offeredTokenId,uint256 wantedTokenId,bool active)",
      "event SwapOffered(address indexed maker,uint256 indexed offeredTokenId,uint256 indexed wantedTokenId)",
      "event SwapCancelled(address indexed maker,uint256 indexed offeredTokenId)",
      "event SwapAccepted(address indexed taker,address indexed maker,uint256 indexed offeredTokenId,uint256 wantedTokenId)",
    ],
    []
  );

  const nftRead = useMemo(() => {
    if (!provider || !nftAddress) return null;
    return new ethers.Contract(nftAddress, NFT_ABI, provider);
  }, [provider, nftAddress, NFT_ABI]);

  const marketRead = useMemo(() => {
    if (!provider || !marketAddress) return null;
    return new ethers.Contract(marketAddress, MARKET_ABI, provider);
  }, [provider, marketAddress, MARKET_ABI]);

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

  const offeredBig = useMemo(() => {
    try { return BigInt(offeredTokenId || "0"); } catch { return 0n; }
  }, [offeredTokenId]);

  const wantedBig = useMemo(() => {
    try { return BigInt(wantedTokenId || "0"); } catch { return 0n; }
  }, [wantedTokenId]);

  async function readOffer() {
    try {
      if (!marketRead) return setStatus("❌ Market (read) no listo.");
      setStatus("Leyendo swapOffers...");
      const o = await marketRead.swapOffers(offeredBig);
      setOfferInfo({
        maker: o[0],
        offeredTokenId: o[1]?.toString?.() ?? String(o[1]),
        wantedTokenId: o[2]?.toString?.() ?? String(o[2]),
        active: Boolean(o[3]),
      });
      setStatus("✅ swapOffers leído.");
    } catch (e) {
      console.error("readOffer error:", e);
      setOfferInfo(null);
      setStatus(`❌ Error leyendo oferta: ${e?.shortMessage ?? e?.message ?? e}`);
    }
  }

  async function readApprovals() {
    try {
      if (!nftRead || !account) return setStatus("❌ NFT (read) no listo o sin cuenta.");
      setStatus("Leyendo approvals...");

      const a1 = await nftRead.getApproved(offeredBig);
      const all1 = await nftRead.isApprovedForAll(account, marketAddress);
      setApprovalOffered({ approved: a1, approvedForAll: all1 });

      const a2 = await nftRead.getApproved(wantedBig);
      const all2 = await nftRead.isApprovedForAll(account, marketAddress);
      setApprovalWanted({ approved: a2, approvedForAll: all2 });

      setStatus("✅ Approvals leídos.");
    } catch (e) {
      console.error("readApprovals error:", e);
      setApprovalOffered(null);
      setApprovalWanted(null);
      setStatus(`❌ Error approvals: ${e?.shortMessage ?? e?.message ?? e}`);
    }
  }

  async function approveOffered() {
    try {
      if (!nftWrite) return setStatus("❌ Conecta MetaMask (no signer).");
      setStatus("📝 Approving offered token...");
      const tx = await nftWrite.approve(marketAddress, offeredBig);
      await tx.wait();
      setStatus("✅ Approve offered OK.");
      await readApprovals();
    } catch (e) {
      console.error(e);
      setStatus(`❌ Approve offered error: ${e?.shortMessage ?? e?.message ?? e}`);
    }
  }

  async function approveWanted() {
    try {
      if (!nftWrite) return setStatus("❌ Conecta MetaMask (no signer).");
      setStatus("📝 Approving wanted token...");
      const tx = await nftWrite.approve(marketAddress, wantedBig);
      await tx.wait();
      setStatus("✅ Approve wanted OK.");
      await readApprovals();
    } catch (e) {
      console.error(e);
      setStatus(`❌ Approve wanted error: ${e?.shortMessage ?? e?.message ?? e}`);
    }
  }

  async function offerSwap() {
    try {
      if (!marketWrite) return setStatus("❌ Conecta MetaMask (no signer).");
      setStatus("📝 Firmando offerSwap...");
      const tx = await marketWrite.offerSwap(offeredBig, wantedBig);
      await tx.wait();
      setStatus("✅ offerSwap OK.");
      await readOffer();
    } catch (e) {
      console.error(e);
      setStatus(`❌ offerSwap error: ${e?.shortMessage ?? e?.message ?? e}`);
    }
  }

  async function cancelSwap() {
    try {
      if (!marketWrite) return setStatus("❌ Conecta MetaMask (no signer).");
      setStatus("📝 Firmando cancelSwap...");
      const tx = await marketWrite.cancelSwap(offeredBig);
      await tx.wait();
      setStatus("✅ cancelSwap OK.");
      await readOffer();
    } catch (e) {
      console.error(e);
      setStatus(`❌ cancelSwap error: ${e?.shortMessage ?? e?.message ?? e}`);
    }
  }

  async function acceptSwap() {
    try {
      if (!marketWrite) return setStatus("❌ Conecta MetaMask (no signer).");
      setStatus("📝 Firmando acceptSwap...");
      const tx = await marketWrite.acceptSwap(offeredBig);
      await tx.wait();
      setStatus("✅ acceptSwap OK.");
      await readOffer();
    } catch (e) {
      console.error(e);
      setStatus(`❌ acceptSwap error: ${e?.shortMessage ?? e?.message ?? e}`);
    }
  }

  useEffect(() => {
    if (!marketRead || !nftRead) return;
    readOffer();
    readApprovals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marketRead, nftRead, offeredBig, wantedBig, account]);
return (
  <div className={styles.wrapper}>
    <h2 className={styles.title}>Swap (NFT ↔ NFT)</h2>

    <div className={styles.addrGrid}>
      <div className={styles.addrRow}>
        <b>NFT:</b> <span className={styles.code}>{nftAddress || "-"}</span>
      </div>
      <div className={styles.addrRow}>
        <b>Market:</b> <span className={styles.code}>{marketAddress || "-"}</span>
      </div>
    </div>

    <div className={styles.formRow}>
      <div className={styles.field}>
        <div className={styles.label}>Offered tokenId</div>
        <input
          className={styles.input}
          value={offeredTokenId}
          onChange={(e) => setOfferedTokenId(e.target.value)}
        />
      </div>

      <div className={styles.field}>
        <div className={styles.label}>Wanted tokenId</div>
        <input
          className={styles.input}
          value={wantedTokenId}
          onChange={(e) => setWantedTokenId(e.target.value)}
        />
      </div>

      <div className={styles.actionsInline}>
        <button className={styles.btn} onClick={readOffer}>
          Read offer
        </button>
        <button className={styles.btn} onClick={readApprovals}>
          Read approvals
        </button>
      </div>
    </div>

    <div className={styles.grid2}>
      <div className={styles.card}>
        <div className={styles.cardTitle}>Offer info</div>

        {!offerInfo ? (
          <div className={styles.muted}>Sin datos todavía.</div>
        ) : (
          <div className={styles.kv}>
            <div className={styles.kvRow}>
              <div className={styles.kvKey}>active</div>
              <div className={styles.kvVal}>
                <span className={`${styles.pill} ${offerInfo.active ? styles.pillOk : styles.pillOff}`}>
                  {offerInfo.active ? "ACTIVE" : "INACTIVE"}
                </span>
              </div>
            </div>

            <div className={styles.kvRow}>
              <div className={styles.kvKey}>maker</div>
              <div className={styles.kvVal}>{offerInfo.maker}</div>
            </div>

            <div className={styles.kvRow}>
              <div className={styles.kvKey}>offeredTokenId</div>
              <div className={styles.kvVal}>{offerInfo.offeredTokenId}</div>
            </div>

            <div className={styles.kvRow}>
              <div className={styles.kvKey}>wantedTokenId</div>
              <div className={styles.kvVal}>{offerInfo.wantedTokenId}</div>
            </div>
          </div>
        )}
      </div>

      <div className={styles.card}>
        <div className={styles.cardTitle}>Approvals (tu cuenta actual)</div>

        <div className={styles.kv}>
          <div className={styles.kvRow}>
            <div className={styles.kvKey}>Offered getApproved</div>
            <div className={styles.kvVal}>{approvalOffered?.approved ?? "-"}</div>
          </div>
          <div className={styles.kvRow}>
            <div className={styles.kvKey}>Offered approvedForAll</div>
            <div className={styles.kvVal}>{approvalOffered ? String(approvalOffered.approvedForAll) : "-"}</div>
          </div>

          <div className={styles.hr} />

          <div className={styles.kvRow}>
            <div className={styles.kvKey}>Wanted getApproved</div>
            <div className={styles.kvVal}>{approvalWanted?.approved ?? "-"}</div>
          </div>
          <div className={styles.kvRow}>
            <div className={styles.kvKey}>Wanted approvedForAll</div>
            <div className={styles.kvVal}>{approvalWanted ? String(approvalWanted.approvedForAll) : "-"}</div>
          </div>

          <div className={styles.hint}>
            💡 Para crear/aceptar swap, cada owner debe aprobar al market su token (o approvalForAll).
          </div>
        </div>
      </div>
    </div>

    <hr className={styles.hr} />

    <h3 className={styles.sectionTitle}>Acciones</h3>

    <div className={styles.btnRow}>
      <button className={`${styles.btn} ${styles.btnSuccess}`} onClick={approveOffered}>
        approve offered
      </button>

      <button className={`${styles.btn} ${styles.btnSuccess}`} onClick={approveWanted}>
        approve wanted
      </button>

      <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={offerSwap}>
        offerSwap(offered, wanted)
      </button>

      <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={acceptSwap}>
        acceptSwap(offered)
      </button>

      <button className={`${styles.btn} ${styles.btnDanger}`} onClick={cancelSwap}>
        cancelSwap(offered)
      </button>
    </div>

    <div className={styles.hint}>
      ✅ Flujo típico: owner(A) aprueba + offerSwap → owner(B) aprueba + acceptSwap.
    </div>
  </div>
);

}
