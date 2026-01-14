import { useMemo, useState } from "react";
import { ethers } from "ethers";
import MyTokens from "../components/MyTokens";

const NFT_ABI = [
  "function mintCard(address to,string juego,string expansion,uint256 numero,string rareza,uint8 estadoInicial) returns (uint256)",
];

const ESTADOS = ["UNKNOWN","POOR","PLAYED","GOOD","NEAR_MINT","MINT","GRADED"];

export default function UserView({ provider, account, nftAddress, marketAddress, canMint, onStatus }) {
  const [mintTo, setMintTo] = useState(account || "");
  const [juego, setJuego] = useState("One Piece TCG");
  const [expansion, setExpansion] = useState("OP09");
  const [numero, setNumero] = useState("1");
  const [rareza, setRareza] = useState("SR");
  const [estado, setEstado] = useState("4");

  const nftWrite = useMemo(() => {
    if (!provider) return null;
    // lo conectamos con signer cuando mint
    return null;
  }, [provider]);

  async function mint() {
    try {
      if (!provider) return;
      const signer = await provider.getSigner();
      const nft = new ethers.Contract(nftAddress, NFT_ABI, signer);

      onStatus?.("Minteando...");
      const tx = await nft.mintCard(
        mintTo || account,
        juego,
        expansion,
        BigInt(numero),
        rareza,
        Number(estado)
      );
      await tx.wait();

      onStatus?.("✅ Mint OK");
    } catch (e) {
      console.error(e);
      onStatus?.(`❌ Mint falló: ${e?.shortMessage ?? e?.message ?? e}`);
    }
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <MyTokens
        provider={provider}
        account={account}
        nftAddress={nftAddress}
        marketAddress={marketAddress}
        onStatus={onStatus}
      />

      <div style={{ padding: 14, border: "1px solid #ddd", borderRadius: 14 }}>
        <h2 style={{ marginTop: 0 }}>User / Minter</h2>

        {!canMint ? (
          <div style={{ opacity: 0.75 }}>
            No tienes <code>MINTER_ROLE</code>, así que aquí no aparece el mint.
          </div>
        ) : (
          <>
            <h3 style={{ marginTop: 0 }}>Mint</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <label>
                To
                <input value={mintTo} onChange={(e) => setMintTo(e.target.value)} style={{ width: "100%", padding: 8 }} />
              </label>

              <label>
                Estado
                <select value={estado} onChange={(e) => setEstado(e.target.value)} style={{ width: "100%", padding: 8 }}>
                  {ESTADOS.map((x, i) => <option key={i} value={i}>{i} - {x}</option>)}
                </select>
              </label>

              <label>
                Juego
                <input value={juego} onChange={(e) => setJuego(e.target.value)} style={{ width: "100%", padding: 8 }} />
              </label>

              <label>
                Expansión
                <input value={expansion} onChange={(e) => setExpansion(e.target.value)} style={{ width: "100%", padding: 8 }} />
              </label>

              <label>
                Número
                <input value={numero} onChange={(e) => setNumero(e.target.value)} style={{ width: "100%", padding: 8 }} />
              </label>

              <label>
                Rareza
                <input value={rareza} onChange={(e) => setRareza(e.target.value)} style={{ width: "100%", padding: 8 }} />
              </label>
            </div>

            <button onClick={mint} style={{ marginTop: 12, padding: "10px 14px", cursor: "pointer" }}>
              Mint
            </button>
          </>
        )}
      </div>
    </div>
  );
}
