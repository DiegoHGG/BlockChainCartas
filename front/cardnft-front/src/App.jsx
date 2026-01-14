import { useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";

import MarketTab from "./MarketTab";
import SwapTab from "./SwapTab";

import AdminView from "./views/AdminView";
import UserView from "./views/UserView";
import InspectorView from "./views/InspectorView";

const NFT_ADDRESS = "0xa9AAd51507Bee07E39391Ddaeb28F4647A7e9965";
const MARKET_ADDRESS = "0xD3B97aB82C1Aff42934eA01D6f514B8520B181Ca";

const ACCESS_ABI = ["function hasRole(bytes32 role, address account) view returns (bool)"];

function shortAddr(a) {
  if (!a) return "";
  return `${a.slice(0, 6)}...${a.slice(-4)}`;
}

export default function App() {
  const [account, setAccount] = useState("");
  const [chainId, setChainId] = useState("");
  const [status, setStatus] = useState("");

  const [active, setActive] = useState("user"); // user | admin | inspector | market | swap

  const [isAdmin, setIsAdmin] = useState(false);
  const [isMinter, setIsMinter] = useState(false);
  const [isInspector, setIsInspector] = useState(false);

  const hasEthereum = typeof window !== "undefined" && window.ethereum;

  const provider = useMemo(() => {
    if (!hasEthereum) return null;
    return new ethers.BrowserProvider(window.ethereum);
  }, [hasEthereum]);

  const accessRead = useMemo(() => {
    if (!provider) return null;
    return new ethers.Contract(NFT_ADDRESS, ACCESS_ABI, provider);
  }, [provider]);

  async function connect() {
    try {
      if (!hasEthereum) {
        setStatus("❌ MetaMask no detectado");
        return;
      }
      setStatus("Conectando...");

      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      const acc = accounts?.[0] ?? "";
      setAccount(acc);

      const net = await provider.getNetwork();
      setChainId(net.chainId.toString());

      // ✅ al conectar, vete a User por defecto
      setActive("user");

      setStatus("✅ Conectado");
    } catch (e) {
      console.error(e);
      setStatus(`❌ Error connect: ${e?.shortMessage ?? e?.message ?? e}`);
    }
  }

  async function loadRoles(acc) {
    try {
      if (!accessRead || !acc) return;

      const ADMIN = ethers.ZeroHash; // DEFAULT_ADMIN_ROLE = 0x00..00
      const MINTER = ethers.id("MINTER_ROLE");
      const INSPECTOR = ethers.id("INSPECTOR_ROLE");

      const a = await accessRead.hasRole(ADMIN, acc);
      const m = await accessRead.hasRole(MINTER, acc);
      const i = await accessRead.hasRole(INSPECTOR, acc);

      setIsAdmin(a);
      setIsMinter(m);
      setIsInspector(i);
    } catch (e) {
      console.error(e);
      setStatus(`❌ Error roles: ${e?.shortMessage ?? e?.message ?? e}`);
    }
  }

  useEffect(() => {
    if (account) loadRoles(account);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account, accessRead]);

  useEffect(() => {
    if (!hasEthereum) return;

    const onAccountsChanged = (accs) => {
      const acc = accs?.[0] ?? "";
      setAccount(acc);
      setActive("user"); // ✅ al cambiar cuenta vuelve a user
      setStatus("Cuenta cambiada");
    };

    const onChainChanged = async () => {
      if (!provider) return;
      const net = await provider.getNetwork();
      setChainId(net.chainId.toString());
      setStatus("Red cambiada");
    };

    window.ethereum.on("accountsChanged", onAccountsChanged);
    window.ethereum.on("chainChanged", onChainChanged);

    return () => {
      window.ethereum.removeListener("accountsChanged", onAccountsChanged);
      window.ethereum.removeListener("chainChanged", onChainChanged);
    };
  }, [hasEthereum, provider]);

  return (
    <div style={{ fontFamily: "system-ui, Arial", padding: 20, maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ margin: 0 }}>CardNFT dApp</h1>
      <div style={{ opacity: 0.8, marginTop: 6 }}>
        NFT: <code>{NFT_ADDRESS}</code>
        <br />
        Market: <code>{MARKET_ADDRESS}</code>
      </div>

      <div style={{ marginTop: 12, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <button onClick={connect} style={{ padding: "10px 14px", cursor: "pointer" }}>
          {account ? "Reconectar" : "Conectar MetaMask"}
        </button>

        <div>
          <div>
            Cuenta: <b>{account ? shortAddr(account) : "-"}</b>
          </div>
          <div>
            chainId: <b>{chainId || "-"}</b>
          </div>

          {/* ✅ chips solo si conectado */}
          {account && (
            <div style={{ marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap" }}>
              {isAdmin && <span style={{ padding: "4px 10px", borderRadius: 999, background: "#eef" }}>ADMIN</span>}
              {isMinter && <span style={{ padding: "4px 10px", borderRadius: 999, background: "#efe" }}>MINTER</span>}
              {isInspector && (
                <span style={{ padding: "4px 10px", borderRadius: 999, background: "#ffe" }}>INSPECTOR</span>
              )}
            </div>
          )}
        </div>
      </div>

      <div style={{ marginTop: 10, padding: 10, borderRadius: 10, border: "1px solid #ddd" }}>
        <b>Status:</b> {status || "-"}
      </div>

      {/* ✅ si NO hay cuenta: solo mensaje */}
      {!account && (
        <div style={{ marginTop: 14, padding: 14, border: "1px solid #eee", borderRadius: 12, opacity: 0.85 }}>
          Conecta MetaMask para ver tus tokens, marketplace y roles.
        </div>
      )}

      {/* ✅ si hay cuenta: tabs + vistas */}
      {account && (
        <>
          <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button onClick={() => setActive("user")} style={{ padding: "10px 14px", cursor: "pointer" }}>
              User / Minter
            </button>
            <button onClick={() => setActive("inspector")} style={{ padding: "10px 14px", cursor: "pointer" }}>
              Inspector
            </button>
            <button
              onClick={() => setActive("admin")}
              style={{ padding: "10px 14px", cursor: "pointer" }}
              disabled={!isAdmin}
              title={!isAdmin ? "Necesitas DEFAULT_ADMIN_ROLE" : ""}
            >
              Admin
            </button>
            <button onClick={() => setActive("market")} style={{ padding: "10px 14px", cursor: "pointer" }}>
              Market (full)
            </button>
            <button onClick={() => setActive("swap")} style={{ padding: "10px 14px", cursor: "pointer" }}>
              Swap
            </button>
          </div>

          <div style={{ marginTop: 16 }}>
            {active === "admin" && isAdmin ? (
              <AdminView provider={provider} account={account} nftAddress={NFT_ADDRESS} marketAddress={MARKET_ADDRESS} onStatus={setStatus} />
            ) : active === "inspector" ? (
              <InspectorView provider={provider} account={account} nftAddress={NFT_ADDRESS} marketAddress={MARKET_ADDRESS} onStatus={setStatus} />
            ) : active === "market" ? (
              <MarketTab provider={provider} account={account} nftAddress={NFT_ADDRESS} marketAddress={MARKET_ADDRESS} onStatus={setStatus} />
            ) : active === "swap" ? (
              <SwapTab provider={provider} account={account} nftAddress={NFT_ADDRESS} marketAddress={MARKET_ADDRESS} onStatus={setStatus} />
            ) : (
              <UserView
                provider={provider}
                account={account}
                nftAddress={NFT_ADDRESS}
                marketAddress={MARKET_ADDRESS}
                canMint={isMinter}
                onStatus={setStatus}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}
