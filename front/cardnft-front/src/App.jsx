import { useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";

import MarketTab from "./MarketTab";
import SwapTab from "./SwapTab";

import AdminView from "./views/AdminView";
import UserView from "./views/UserView";
import InspectorView from "./views/InspectorView";

import styles from "./App.module.css";

const NFT_ADDRESS = "0x08c4C79461488aE9C60F614c555b365F2D00210E";
const MARKET_ADDRESS = "0x01ed7825c79b0E9Df87e828500c199DaBc4daDFD";

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
      setActive("user");
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
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.titleBlock}>
          <h1 className={styles.title}>CardNFT dApp</h1>
          <div className={styles.subTitle}>
            <div>
              NFT: <span className={styles.mono}>{NFT_ADDRESS}</span>
            </div>
            <div>
              Market: <span className={styles.mono}>{MARKET_ADDRESS}</span>
            </div>
          </div>
        </div>

        <div className={styles.connectBlock}>
          <button className={styles.primaryBtn} onClick={connect}>
            {account ? "Reconectar" : "Conectar MetaMask"}
          </button>

          <div className={styles.meta}>
            <div>
              Cuenta: <b>{account ? shortAddr(account) : "-"}</b>
            </div>
            <div>
              chainId: <b>{chainId || "-"}</b>
            </div>

            {account && (
              <div className={styles.chips}>
                {isAdmin && <span className={`${styles.chip} ${styles.chipAdmin}`}>ADMIN</span>}
                {isMinter && <span className={`${styles.chip} ${styles.chipMinter}`}>MINTER</span>}
                {isInspector && <span className={`${styles.chip} ${styles.chipInspector}`}>INSPECTOR</span>}
              </div>
            )}
          </div>
        </div>
      </header>

      <div className={styles.statusBar}>
        <b>Status:</b> <span>{status || "-"}</span>
      </div>

      {!account ? (
        <section className={styles.notice}>
          Conecta MetaMask para ver tus tokens, marketplace y roles.
        </section>
      ) : (
        <>
          <nav className={styles.tabs}>
            <button
              className={`${styles.tab} ${active === "user" ? styles.tabActive : ""}`}
              onClick={() => setActive("user")}
            >
              User / Minter
            </button>

            <button
              className={`${styles.tab} ${active === "inspector" ? styles.tabActive : ""}`}
              onClick={() => setActive("inspector")}
            >
              Inspector
            </button>

            <button
              className={`${styles.tab} ${active === "admin" ? styles.tabActive : ""}`}
              onClick={() => setActive("admin")}
              disabled={!isAdmin}
              title={!isAdmin ? "Necesitas DEFAULT_ADMIN_ROLE" : ""}
            >
              Admin
            </button>

            <button
              className={`${styles.tab} ${active === "market" ? styles.tabActive : ""}`}
              onClick={() => setActive("market")}
            >
              Market
            </button>

            <button
              className={`${styles.tab} ${active === "swap" ? styles.tabActive : ""}`}
              onClick={() => setActive("swap")}
            >
              Swap
            </button>
          </nav>

          <main className={styles.content}>
            {active === "admin" && isAdmin ? (
              <AdminView
                provider={provider}
                account={account}
                nftAddress={NFT_ADDRESS}
                marketAddress={MARKET_ADDRESS}
                onStatus={setStatus}
              />
            ) : active === "inspector" ? (
              <InspectorView
                provider={provider}
                account={account}
                nftAddress={NFT_ADDRESS}
                marketAddress={MARKET_ADDRESS}
                onStatus={setStatus}
              />
            ) : active === "market" ? (
              <MarketTab
                provider={provider}
                account={account}
                nftAddress={NFT_ADDRESS}
                marketAddress={MARKET_ADDRESS}
                onStatus={setStatus}
              />
            ) : active === "swap" ? (
              <SwapTab
                provider={provider}
                account={account}
                nftAddress={NFT_ADDRESS}
                marketAddress={MARKET_ADDRESS}
                onStatus={setStatus}
              />
            ) : (
              <UserView
                provider={provider}
                account={account}
                nftAddress={NFT_ADDRESS}
                marketAddress={MARKET_ADDRESS}
                canMint={true}
                onStatus={setStatus}
              />
            )}
          </main>
        </>
      )}
    </div>
  );
}
