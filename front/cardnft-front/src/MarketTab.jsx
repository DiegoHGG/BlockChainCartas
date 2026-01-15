import { useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import styles from "./MarketTab.module.css";

// ✅ Reutilizamos el MISMO CSS + layout que MyTokens
import tokStyles from "./components/MyTokens.module.css";
import { HoloCard } from "react-holo-card-effect";

const ESTADOS = ["UNKNOWN", "POOR", "PLAYED", "GOOD", "NEAR_MINT", "MINT", "GRADED"];

function shortAddr(a) {
  if (!a) return "";
  return `${a.slice(0, 6)}...${a.slice(-4)}`;
}

function normalizeExpansion(x) {
  return (x || "").trim().toUpperCase();
}

function normalizeNumber(x) {
  const s = (x || "").trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function pad3(n) {
  return String(n).padStart(3, "0");
}

/**
 * ✅ MISMA lógica que MyTokens:
 * - id = "OP09-001"
 * - prueba /cards/OP09-001.webp/.png/.jpg/.jpeg
 */
function buildImageCandidates(expansion, numero) {
  const id = `${normalizeExpansion(expansion)}-${pad3(numero)}`; // OP09-001
  return [
    `/cards/${id}.webp`,
    `/cards/${id}.png`,
    `/cards/${id}.jpg`,
    `/cards/${id}.jpeg`,
  ];
}

function CardPreview({ expansion, numero, className }) {
  const [resolvedUrl, setResolvedUrl] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function resolveUrl() {
      setResolvedUrl(null);

      const candidates = buildImageCandidates(expansion, Number(numero));

      for (const url of candidates) {
        const ok = await new Promise((r) => {
          const img = new Image();
          img.onload = () => r(true);
          img.onerror = () => r(false);
          img.src = url;
        });

        if (!cancelled && ok) {
          setResolvedUrl(url);
          return;
        }
      }
    }

    resolveUrl();
    return () => {
      cancelled = true;
    };
  }, [expansion, numero]);

  if (!resolvedUrl) return null;

  return (
    <div className={className}>
      <HoloCard url={resolvedUrl} width={190} height={260} showSparkles />
    </div>
  );
}

export default function MarketTab({ provider, account, nftAddress, marketAddress, onStatus }) {
  const [loading, setLoading] = useState(false);
  const [tokens, setTokens] = useState([]);

  // buscador
  const [expansion, setExpansion] = useState("OP09");
  const [numero, setNumero] = useState(""); // opcional

  function setStatus(msg) {
    onStatus?.(msg);
  }

  const NFT_ABI = useMemo(
    () => [
      // Enumerable
      "function totalSupply() view returns (uint256)",
      "function tokenByIndex(uint256 index) view returns (uint256)",

      // custom data
      "function getCard(uint256 tokenId) view returns (address owner,string juego,string expansion,uint256 numero,string rareza,uint8 estado,uint64 updatedAt)",
    ],
    []
  );

  const MARKET_ABI = useMemo(
    () => [
      "function listings(uint256 tokenId) view returns (address seller, uint256 price)",
      "function buy(uint256 tokenId) payable",
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

  async function loadSales() {
    try {
      if (!nftRead || !marketRead) return;

      const exp = normalizeExpansion(expansion);
      const num = normalizeNumber(numero);

      if (!exp) {
        setStatus("⚠️ Pon una expansión (ej: OP09).");
        return;
      }

      setLoading(true);
      setTokens([]);
      setStatus("Cargando ventas...");

      const supply = await nftRead.totalSupply();
      const total = Number(supply);

      const rows = [];

      for (let i = 0; i < total; i++) {
        const tokenId = await nftRead.tokenByIndex(i);
        const idStr = tokenId.toString();

        const data = await nftRead.getCard(tokenId);

        const cardExp = normalizeExpansion(data[2]);
        const cardNum = Number(data[3]);

        if (cardExp !== exp) continue;
        if (num !== null && cardNum !== num) continue;

        // listing
        let listing = { seller: ethers.ZeroAddress, price: 0n };
        try {
          listing = await marketRead.listings(tokenId);
        } catch {
          // ignore
        }

        const listed = listing?.seller && listing.seller !== ethers.ZeroAddress;
        if (!listed) continue; // ✅ Ventas = solo listados

        rows.push({
          tokenId: idStr,
          owner: data[0],
          juego: data[1],
          expansion: data[2],
          numero: data[3].toString(),
          rareza: data[4],
          estado: Number(data[5]),
          updatedAt: Number(data[6]),
          listingSeller: listing.seller,
          listingPrice: listing.price ?? 0n,
        });
      }

      setTokens(rows);
      setStatus(`✅ Ventas encontradas: ${rows.length}`);
    } catch (e) {
      console.error(e);
      setStatus(`❌ Error cargando ventas: ${e?.shortMessage ?? e?.message ?? e}`);
    } finally {
      setLoading(false);
    }
  }

  async function buyToken(tokenId, priceWei) {
    try {
      if (!provider) return;
      const signer = await provider.getSigner();
      const market = new ethers.Contract(marketAddress, MARKET_ABI, signer);

      setStatus(`📝 Comprando token ${tokenId}...`);
      const tx = await market.buy(BigInt(tokenId), { value: BigInt(priceWei) });
      setStatus("⏳ Buy enviado, esperando confirmación...");
      await tx.wait();
      setStatus("✅ Compra confirmada.");

      await loadSales();
    } catch (e) {
      console.error(e);
      setStatus(`❌ Error buy: ${e?.shortMessage ?? e?.message ?? e}`);
    }
  }

  // auto-load al entrar si hay provider
  useEffect(() => {
    if (nftRead && marketRead) loadSales();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nftRead, marketRead]);

  return (
    <section className={`card ${tokStyles.wrapper}`}>
      <div className={tokStyles.headerRow}>
        <div>
          <h2 className="cardTitle" style={{ margin: 0 }}>Ventas</h2>
          <div className="cardSubtitle" style={{ margin: "6px 0 0 0" }}>
            Tokens listados en el market (filtra por expansión y número).
          </div>
        </div>

        <button className="btn" onClick={loadSales} disabled={loading}>
          {loading ? "Cargando..." : "Refrescar"}
        </button>
      </div>

      {/* Buscador */}
      <div className={styles.formRow} style={{ marginTop: 10 }}>
        <div className={styles.field}>
          <div className={styles.label}>Expansión</div>
          <input
            className={styles.input}
            value={expansion}
            onChange={(e) => setExpansion(e.target.value)}
            placeholder="OP09"
          />
        </div>

        <div className={styles.field}>
          <div className={styles.label}>Número (opcional)</div>
          <input
            className={styles.input}
            value={numero}
            onChange={(e) => setNumero(e.target.value)}
            placeholder="001 (o vacío)"
          />
        </div>

        <div className={styles.actionsInline}>
          <button className={styles.btn} onClick={loadSales} disabled={loading}>
            Buscar
          </button>
        </div>
      </div>

      {!account ? (
        <div className="help">Conecta MetaMask para comprar.</div>
      ) : tokens.length === 0 ? (
        <div className="help">No hay ventas con esos filtros.</div>
      ) : (
        <div className={tokStyles.grid}>
          {tokens.map((t) => {
            const priceEth = ethers.formatEther(t.listingPrice);

            return (
              <div key={t.tokenId} className={tokStyles.tokenCard}>
                <div className={tokStyles.top}>
                  {/* ✅ EXACTO como MyTokens: preview + info */}
                  <div className={tokStyles.leftBlock}>
                    <CardPreview
                      expansion={t.expansion}
                      numero={t.numero}
                      className={tokStyles.previewWrap}
                    />

                    <div className={tokStyles.infoBlock}>
                      <div className={tokStyles.tokenId}>Token #{t.tokenId}</div>
                      <div className="subtle" style={{ marginTop: 4 }}>
                        {t.juego} · {t.expansion} · #{t.numero} · {t.rareza}
                      </div>
                      <div style={{ marginTop: 8 }}>
                        <span className={tokStyles.estado}>
                          {ESTADOS[t.estado] ?? "?"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div style={{ textAlign: "right" }}>
                    <div className="small">Seller</div>
                    <div className="mono">{shortAddr(t.listingSeller)}</div>
                  </div>
                </div>

                <div className={tokStyles.actions}>
                  <div className={tokStyles.listedPill}>
                    Listado: <b>{priceEth} ETH</b>
                  </div>

                  <button
                    className="btn btnPrimary"
                    onClick={() => buyToken(t.tokenId, t.listingPrice)}
                    disabled={loading}
                    title="Comprar (envía ETH nativo)"
                  >
                    Comprar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
