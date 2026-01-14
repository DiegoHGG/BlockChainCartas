import { useState } from "react";
import { ethers } from "ethers";
import MyTokens from "../components/MyTokens";

const NFT_ABI = [
  "function updateEstado(uint256 tokenId, uint8 nuevoEstado)",
];

const ESTADOS = ["UNKNOWN","POOR","PLAYED","GOOD","NEAR_MINT","MINT","GRADED"];

export default function InspectorView({ provider, account, nftAddress, marketAddress, onStatus }) {
  const [tokenId, setTokenId] = useState("1");
  const [estado, setEstado] = useState("3");

  async function update() {
    try {
      if (!provider) return;
      const signer = await provider.getSigner();
      const nft = new ethers.Contract(nftAddress, NFT_ABI, signer);

      onStatus?.(`Actualizando estado token ${tokenId}...`);
      const tx = await nft.updateEstado(BigInt(tokenId), Number(estado));
      await tx.wait();

      onStatus?.("✅ Estado actualizado");
    } catch (e) {
      console.error(e);
      onStatus?.(`❌ updateEstado falló: ${e?.shortMessage ?? e?.message ?? e}`);
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
        <h2 style={{ marginTop: 0 }}>Inspector Panel</h2>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <label>
            TokenId
            <input value={tokenId} onChange={(e) => setTokenId(e.target.value)} style={{ padding: 8, width: 140, marginLeft: 8 }} />
          </label>

          <label>
            Nuevo estado
            <select value={estado} onChange={(e) => setEstado(e.target.value)} style={{ padding: 8, marginLeft: 8 }}>
              {ESTADOS.map((x, i) => <option key={i} value={i}>{i} - {x}</option>)}
            </select>
          </label>

          <button onClick={update} style={{ padding: "10px 14px", cursor: "pointer" }}>
            Actualizar estado
          </button>
        </div>

        <div style={{ marginTop: 10, opacity: 0.75 }}>
          Un inspector puede cambiar el estado aunque no sea owner.
        </div>
      </div>
    </div>
  );
}
