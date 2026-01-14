import { useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import MarketTab from "./MarketTab";
import SwapTab from "./SwapTab";

/**
 * Dirección del contrato desplegado.
 * ⚠️ Ojo: debe ser la dirección del CONTRATO en ESA MISMA RED donde está MetaMask.
 */
const CONTRACT_ADDRESS = "0xcab9FA1f1e8C48E8fd926dcE19F9f09B8c3Ea572";
const NFT_ADDRESS = CONTRACT_ADDRESS; // tu CardNFT
//TODO CONTRATO CUANDO FUFE
const MARKET_ADDRESS = "0xD3B97aB82C1Aff42934eA01D6f514B8520B181Ca";

/**
 * ABI mínimo del contrato.
 * - Aquí declaramos solo las funciones/events que vamos a usar desde el front.
 * - Si cambias el contrato o añades funciones, añade sus firmas aquí.
 */
const ABI = [
  // ERC721
  "function ownerOf(uint256 tokenId) view returns (address)",

  // Tu contrato
  "function nextTokenId() view returns (uint256)",
  "function mintCard(address to,string juego,string expansion,uint256 numero,string rareza,uint8 estadoInicial) returns (uint256)",
  "function getCard(uint256 tokenId) view returns (address owner,string juego,string expansion,uint256 numero,string rareza,uint8 estado,uint64 updatedAt)",
  "function estadoOf(uint256 tokenId) view returns (uint8 estado,uint64 updatedAt)",
  "function updateEstado(uint256 tokenId,uint8 nuevoEstado)",
  "function adminUpdateEstado(uint256 tokenId,uint8 nuevoEstado)",

  // events (opcional)
  "event CardMinted(uint256 indexed tokenId,address indexed to,string juego,string expansion,uint256 numero,string rareza,uint8 estadoInicial)",
  "event EstadoUpdated(uint256 indexed tokenId,address indexed operator,uint8 estadoAnterior,uint8 estadoNuevo,uint256 timestamp)",
];

/**
 * Tu enum Estado convertido a array de nombres (índice = valor enum)
 */
const ESTADOS = [
  "UNKNOWN",
  "POOR",
  "PLAYED",
  "GOOD",
  "NEAR_MINT",
  "MINT",
  "GRADED",
];

/**
 * Helper para mostrar addresses cortas (estético)
 */
function shortAddr(a) {
  if (!a) return "";
  return `${a.slice(0, 6)}...${a.slice(-4)}`;
}

/**
 * Helper para "prints" consistentes
 */
function logTx(tag, obj) {
  console.groupCollapsed(`🧪 ${tag}`);
  console.log(obj);
  console.groupEnd();
}

/**
 * Componente principal
 */
export default function App() {
  // --- Estado de conexión ---
  const [account, setAccount] = useState(""); // wallet conectada
  const [chainId, setChainId] = useState(""); // chainId actual
  const [status, setStatus] = useState(""); // mensajes en UI

  // --- Estado para lectura de tokens ---
  const [tokenIdQuery, setTokenIdQuery] = useState("1");
  const [cardResult, setCardResult] = useState(null);

  // --- Estado del formulario de mint ---
  const [mintTo, setMintTo] = useState("");
  const [mintJuego, setMintJuego] = useState("One Piece TCG");
  const [mintExpansion, setMintExpansion] = useState("OP09");
  const [mintNumero, setMintNumero] = useState("1");
  const [mintRareza, setMintRareza] = useState("SR");
  const [mintEstado, setMintEstado] = useState("4"); // NEAR_MINT

  // --- Estado del formulario update estado ---
  const [updTokenId, setUpdTokenId] = useState("1");
  const [updEstado, setUpdEstado] = useState("3"); // GOOD
  const [useAdminUpdate, setUseAdminUpdate] = useState(false);

  /**
   * Detecta si existe window.ethereum (MetaMask)
   */
  const hasEthereum = typeof window !== "undefined" && window.ethereum;
  //use state para estado del nft que se quiere comprar 
  const [activeTab, setActiveTab] = useState("nft"); // "nft" | "market |swap"

  /**
   * provider (solo lectura): se usa para calls view y getNetwork
   * ethers v6: BrowserProvider
   */
  const provider = useMemo(() => {
    if (!hasEthereum) return null;
    const p = new ethers.BrowserProvider(window.ethereum);
    console.log("✅ provider creado:", p);
    return p;
  }, [hasEthereum]);

  /**
   * Contrato en modo lectura (con provider)
   * -> permite llamar a funciones view sin firmar transacciones
   */
  const contractRead = useMemo(() => {
    if (!provider) return null;
    const c = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);
    console.log("✅ contractRead creado:", c);
    return c;
  }, [provider]);

  /**
   * contractWrite se crea tras conectar (necesita signer)
   * -> permite mandar transacciones (mint, updateEstado...)
   */
  const [contractWrite, setContractWrite] = useState(null);

  /**
   * Conecta MetaMask:
   * 1) pide cuentas
   * 2) obtiene chainId
   * 3) crea signer
   * 4) crea contrato con signer (write)
   */
  async function connect() {
    console.group("🔌 connect()");
    try {
      if (!hasEthereum) {
        setStatus("❌ MetaMask no detectado.");
        console.warn("No hay window.ethereum");
        return;
      }

      setStatus("Conectando a MetaMask...");

      const accounts = await window.ethereum.request({
        method: "eth_requestAccounts",
      });

      const acc = accounts?.[0] ?? "";
      setAccount(acc);
      console.log("Cuenta conectada:", acc);

      const net = await provider.getNetwork();
      setChainId(net.chainId.toString());
      console.log("Network:", net);

      const signer = await provider.getSigner();
      console.log("Signer:", signer);

      const cWrite = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);
      setContractWrite(cWrite);
      console.log("✅ contractWrite creado:", cWrite);

      // por defecto, mintear a ti
      setMintTo(acc);

      setStatus("✅ Conectado.");
    } catch (e) {
      console.error("Error connect:", e);
      setStatus(`❌ Error al conectar: ${e?.shortMessage ?? e?.message ?? e}`);
    } finally {
      console.groupEnd();
    }
  }

  /**
   * Refresca chainId cuando cambia la red
   */
  async function refreshNetworkInfo() {
    console.group("🌐 refreshNetworkInfo()");
    try {
      if (!provider) return;
      const net = await provider.getNetwork();
      console.log("Network:", net);
      setChainId(net.chainId.toString());
    } catch (e) {
      console.error("Error refreshNetworkInfo:", e);
    } finally {
      console.groupEnd();
    }
  }

  /**
   * Listeners de MetaMask:
   * - accountsChanged: usuario cambia cuenta
   * - chainChanged: usuario cambia de red
   */
  useEffect(() => {
    if (!hasEthereum) return;

    const onAccountsChanged = (accs) => {
      console.log("👤 accountsChanged:", accs);
      setAccount(accs?.[0] ?? "");
      setStatus("Cuenta cambiada.");
    };

    const onChainChanged = (newChainIdHex) => {
      console.log("⛓️ chainChanged:", newChainIdHex);
      refreshNetworkInfo();
      setStatus("Red cambiada. Recomiendo reconectar.");
      setContractWrite(null); // forzamos a reconectar para obtener signer correcto
    };

    window.ethereum.on("accountsChanged", onAccountsChanged);
    window.ethereum.on("chainChanged", onChainChanged);

    return () => {
      window.ethereum.removeListener("accountsChanged", onAccountsChanged);
      window.ethereum.removeListener("chainChanged", onChainChanged);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasEthereum]);

  /**
   * DEBUG útil: lee nextTokenId para saber si existen tokens.
   * - Si nextTokenId == 1 -> no existe ningún token aún
   * - Si nextTokenId == 2 -> existe token 1
   */
  async function readNextTokenId() {
    console.group("🔎 readNextTokenId()");
    try {
      if (!contractRead) {
        setStatus("❌ contractRead no listo (conecta MetaMask).");
        return;
      }
      setStatus("Leyendo nextTokenId...");
      const n = await contractRead.nextTokenId();
      const nStr = n.toString();
      console.log("nextTokenId:", nStr);

      const last = (BigInt(n) - 1n);
      if (BigInt(n) === 1n) {
        setStatus("nextTokenId = 1 → aún no hay tokens minteados.");
      } else {
        setStatus(`nextTokenId = ${nStr} → último token existente: ${last.toString()}`);
      }
    } catch (e) {
      console.error("Error readNextTokenId:", e);
      setStatus(`❌ Error nextTokenId: ${e?.shortMessage ?? e?.message ?? e}`);
    } finally {
      console.groupEnd();
    }
  }

  /**
   * Lee datos completos de la carta.
   * ⚠️ IMPORTANTE:
   * getCard() llama ownerOf() dentro del contrato
   * -> si el tokenId NO existe, revierte y en JS verás CALL_EXCEPTION.
   */
  async function readCard() {
    console.group("📦 readCard()");
    try {
      if (!contractRead) {
        setStatus("❌ contractRead no listo (conecta MetaMask).");
        return;
      }

      setStatus("Leyendo carta (getCard)...");
      const tokenId = BigInt(tokenIdQuery);
      console.log("tokenIdQuery:", tokenIdQuery, "=>", tokenId.toString());

      // 🔎 Tip: si te revierte mucho, antes llama readNextTokenId para saber si existe.
      const data = await contractRead.getCard(tokenId);
      logTx("getCard result", data);

      setCardResult({
        tokenId: tokenId.toString(),
        owner: data[0],
        juego: data[1],
        expansion: data[2],
        numero: data[3].toString(),
        rareza: data[4],
        estado: Number(data[5]),
        updatedAt: Number(data[6]),
      });

      setStatus("✅ getCard OK.");
    } catch (e) {
      console.error("Error readCard:", e);
      setCardResult(null);

      // Mensajes típicos de revert
      const msg = e?.shortMessage ?? e?.message ?? String(e);
      setStatus(`❌ getCard falló: ${msg}`);

      // Debug extra (muy útil)
      console.log("Debug error object:", e);
      if (e?.info) console.log("Debug e.info:", e.info);
      if (e?.data) console.log("Debug e.data:", e.data);
    } finally {
      console.groupEnd();
    }
  }

  /**
   * Lee solo estado + timestamp de update.
   * También revierte si no existe el token (porque estadoOf() hace ownerOf(tokenId) en tu contrato).
   */
  async function readEstadoOf() {
    console.group("📌 readEstadoOf()");
    try {
      if (!contractRead) {
        setStatus("❌ contractRead no listo (conecta MetaMask).");
        return;
      }

      setStatus("Leyendo estado (estadoOf)...");
      const tokenId = BigInt(tokenIdQuery);
      console.log("tokenIdQuery:", tokenIdQuery, "=>", tokenId.toString());

      const [estado, updatedAt] = await contractRead.estadoOf(tokenId);
      logTx("estadoOf result", { estado, updatedAt });

      setCardResult((prev) => ({
        ...(prev ?? { tokenId: tokenId.toString() }),
        estado: Number(estado),
        updatedAt: Number(updatedAt),
      }));

      setStatus("✅ estadoOf OK.");
    } catch (e) {
      console.error("Error readEstadoOf:", e);
      const msg = e?.shortMessage ?? e?.message ?? String(e);
      setStatus(`❌ estadoOf falló: ${msg}`);
    } finally {
      console.groupEnd();
    }
  }

  /**
   * Mint:
   * - Requiere MINTER_ROLE en el contrato
   * - Envía tx (escritura), hay que firmar con MetaMask
   */
  async function mint() {
    console.group("🪙 mint()");
    try {
      if (!contractWrite) {
        setStatus("❌ Conecta MetaMask primero (contractWrite null).");
        console.warn("contractWrite es null, falta conectar.");
        return;
      }

      setStatus("Enviando mint (firma + tx)...");
      console.log("mint params:", {
        mintTo,
        mintJuego,
        mintExpansion,
        mintNumero,
        mintRareza,
        mintEstado,
      });

      const tx = await contractWrite.mintCard(
        mintTo,
        mintJuego,
        mintExpansion,
        BigInt(mintNumero),
        mintRareza,
        Number(mintEstado)
      );

      console.log("Tx enviada:", tx);
      setStatus("⏳ Minteando... esperando confirmación.");

      const receipt = await tx.wait();
      console.log("Receipt:", receipt);

      setStatus(`✅ Mint confirmado. Tx: ${receipt.hash}`);

      // Opcional: actualizar tokenIdQuery al último
      // (si nextTokenId ahora es N, el último token es N-1)
      try {
        const n = await contractRead.nextTokenId();
        const last = (BigInt(n) - 1n).toString();
        setTokenIdQuery(last);
        setUpdTokenId(last);
        console.log("Auto-set tokenIdQuery/updTokenId:", last);
      } catch (e2) {
        console.warn("No pude leer nextTokenId tras mint:", e2);
      }
    } catch (e) {
      console.error("Error mint:", e);
      const msg = e?.shortMessage ?? e?.message ?? String(e);
      setStatus(`❌ Error mint: ${msg}`);
    } finally {
      console.groupEnd();
    }
  }

  /**
   * updateEstado:
   * - updateEstado: lo puede hacer el owner o inspector
   * - adminUpdateEstado: solo admin
   */
  async function updateEstado() {
    console.group("🔧 updateEstado()");
    try {
      if (!contractWrite) {
        setStatus("❌ Conecta MetaMask primero (contractWrite null).");
        return;
      }

      const tokenId = BigInt(updTokenId);
      const nuevo = Number(updEstado);

      setStatus(useAdminUpdate ? "Enviando adminUpdateEstado..." : "Enviando updateEstado...");
      console.log("update params:", { tokenId: tokenId.toString(), nuevo, useAdminUpdate });

      const tx = useAdminUpdate
        ? await contractWrite.adminUpdateEstado(tokenId, nuevo)
        : await contractWrite.updateEstado(tokenId, nuevo);

      console.log("Tx enviada:", tx);
      setStatus("⏳ Actualizando... esperando confirmación.");

      const receipt = await tx.wait();
      console.log("Receipt:", receipt);

      setStatus(`✅ Estado actualizado. Tx: ${receipt.hash}`);
    } catch (e) {
      console.error("Error updateEstado:", e);
      const msg = e?.shortMessage ?? e?.message ?? String(e);
      setStatus(`❌ Error update: ${msg}`);
    } finally {
      console.groupEnd();
    }
  }

  /**
   * Formatea timestamp a texto humano (si existe)
   */
  const updatedAtHuman = cardResult?.updatedAt
    ? new Date(cardResult.updatedAt * 1000).toLocaleString()
    : "";

  // --- UI ---
  return (
    <div style={{ fontFamily: "system-ui, Arial", padding: 20, maxWidth: 980, margin: "0 auto" }}>
      <h1 style={{ marginBottom: 6 }}>CardNFT Front (React + ethers)</h1>
      <div style={{ opacity: 0.8, marginBottom: 16 }}>
        Contrato: <code>{CONTRACT_ADDRESS}</code>
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <button onClick={connect} style={{ padding: "10px 14px", cursor: "pointer" }}>
          Conectar MetaMask
        </button>
        <div>
          <div>
            Cuenta: <b>{account ? shortAddr(account) : "-"}</b>
          </div>
          <div>
            chainId: <b>{chainId || "-"}</b>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 10, padding: 10, borderRadius: 10, border: "1px solid #ddd" }}>
        <b>Status:</b> {status || "-"}
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
        <button onClick={() => setActiveTab("nft")} style={{ padding: "10px 14px", cursor: "pointer" }}>
          NFT (Mint / Leer / Estado)
        </button>
        <button onClick={() => setActiveTab("market")} style={{ padding: "10px 14px", cursor: "pointer" }}>
          Compra / Venta
        </button>
        <button onClick={() => setActiveTab("swap")} style={{ padding: "10px 14px", cursor: "pointer" }}>
          Swap
        </button>
      </div>

      <div style={{ marginTop: 16 }}>
        {activeTab === "market" ? (
          <MarketTab
            provider={provider}
            account={account}
            nftAddress={NFT_ADDRESS}
            marketAddress={MARKET_ADDRESS}
            onStatus={setStatus}
          />
        ) : activeTab === "swap" ? (
          <SwapTab
            provider={provider}
            account={account}
            nftAddress={NFT_ADDRESS}
            marketAddress={MARKET_ADDRESS}
            onStatus={setStatus}
          />
        ) : null}
      </div>

      {activeTab === "nft" && (
        <>

          <hr style={{ margin: "22px 0" }} />

          {/* READ */}
          <section style={{ padding: 14, border: "1px solid #ddd", borderRadius: 14 }}>
            <h2 style={{ marginTop: 0 }}>Leer carta</h2>

            {/* Botón debug clave */}
            <button onClick={readNextTokenId} style={{ padding: "10px 14px", cursor: "pointer", marginBottom: 10 }}>
              Debug: nextTokenId()
            </button>

            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <label>
                TokenId:&nbsp;
                <input
                  value={tokenIdQuery}
                  onChange={(e) => setTokenIdQuery(e.target.value)}
                  style={{ padding: 8, width: 140 }}
                />
              </label>
              <button onClick={readCard} style={{ padding: "10px 14px", cursor: "pointer" }}>
                getCard(tokenId)
              </button>
              <button onClick={readEstadoOf} style={{ padding: "10px 14px", cursor: "pointer" }}>
                estadoOf(tokenId)
              </button>
            </div>

            <div style={{ marginTop: 14 }}>
              {!cardResult ? (
                <div style={{ opacity: 0.7 }}>Sin resultados todavía.</div>
              ) : (
                <div style={{ padding: 12, borderRadius: 12, background: "#fafafa", border: "1px solid #eee" }}>
                  <div><b>tokenId:</b> {cardResult.tokenId}</div>
                  {cardResult.owner && <div><b>owner:</b> {cardResult.owner}</div>}
                  {cardResult.juego && <div><b>juego:</b> {cardResult.juego}</div>}
                  {cardResult.expansion && <div><b>expansion:</b> {cardResult.expansion}</div>}
                  {cardResult.numero && <div><b>numero:</b> {cardResult.numero}</div>}
                  {cardResult.rareza && <div><b>rareza:</b> {cardResult.rareza}</div>}
                  {typeof cardResult.estado === "number" && (
                    <div><b>estado:</b> {cardResult.estado} ({ESTADOS[cardResult.estado] ?? "?"})</div>
                  )}
                  {updatedAtHuman && <div><b>updatedAt:</b> {cardResult.updatedAt} ({updatedAtHuman})</div>}
                </div>
              )}
            </div>

            <div style={{ marginTop: 10, opacity: 0.75 }}>
              💡 Si <code>getCard</code> revierte: normalmente es porque ese tokenId no existe (no minteado),
              o estás en la red equivocada.
            </div>
          </section>

          <hr style={{ margin: "22px 0" }} />

          {/* MINT */}
          <section style={{ padding: 14, border: "1px solid #ddd", borderRadius: 14 }}>
            <h2 style={{ marginTop: 0 }}>Mint (solo MINTER_ROLE)</h2>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <label>
                To (address)
                <input value={mintTo} onChange={(e) => setMintTo(e.target.value)} style={{ width: "100%", padding: 8 }} />
              </label>
              <label>
                Estado inicial
                <select value={mintEstado} onChange={(e) => setMintEstado(e.target.value)} style={{ width: "100%", padding: 8 }}>
                  {ESTADOS.map((name, idx) => (
                    <option key={idx} value={idx}>
                      {idx} - {name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Juego
                <input value={mintJuego} onChange={(e) => setMintJuego(e.target.value)} style={{ width: "100%", padding: 8 }} />
              </label>
              <label>
                Expansión
                <input
                  value={mintExpansion}
                  onChange={(e) => setMintExpansion(e.target.value)}
                  style={{ width: "100%", padding: 8 }}
                />
              </label>

              <label>
                Número
                <input value={mintNumero} onChange={(e) => setMintNumero(e.target.value)} style={{ width: "100%", padding: 8 }} />
              </label>
              <label>
                Rareza
                <input value={mintRareza} onChange={(e) => setMintRareza(e.target.value)} style={{ width: "100%", padding: 8 }} />
              </label>
            </div>

            <button onClick={mint} style={{ marginTop: 12, padding: "10px 14px", cursor: "pointer" }}>
              Mint
            </button>

            <div style={{ marginTop: 10, opacity: 0.7 }}>
              Si te revierte con <code>AccessControl</code>, esa cuenta no tiene el rol MINTER_ROLE.
            </div>
          </section>

          <hr style={{ margin: "22px 0" }} />

          {/* UPDATE ESTADO */}
          <section style={{ padding: 14, border: "1px solid #ddd", borderRadius: 14 }}>
            <h2 style={{ marginTop: 0 }}>Actualizar estado</h2>

            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <label>
                TokenId:&nbsp;
                <input value={updTokenId} onChange={(e) => setUpdTokenId(e.target.value)} style={{ padding: 8, width: 140 }} />
              </label>

              <label>
                Nuevo estado:&nbsp;
                <select value={updEstado} onChange={(e) => setUpdEstado(e.target.value)} style={{ padding: 8 }}>
                  {ESTADOS.map((name, idx) => (
                    <option key={idx} value={idx}>
                      {idx} - {name}
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={useAdminUpdate}
                  onChange={(e) => setUseAdminUpdate(e.target.checked)}
                />
                Usar <code>adminUpdateEstado</code> (solo ADMIN)
              </label>
            </div>

            <button onClick={updateEstado} style={{ marginTop: 12, padding: "10px 14px", cursor: "pointer" }}>
              Actualizar
            </button>

            <div style={{ marginTop: 10, opacity: 0.7 }}>
              <div><b>updateEstado</b>: owner o INSPECTOR.</div>
              <div><b>adminUpdateEstado</b>: DEFAULT_ADMIN_ROLE.</div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
