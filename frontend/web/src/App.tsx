import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { getContractReadOnly, getContractWithSigner } from "./components/useContract";
import "./App.css";
import { useAccount } from 'wagmi';
import { useFhevm, useEncrypt, useDecrypt } from '../fhevm-sdk/src';

interface NewsItem {
  id: number;
  title: string;
  category: string;
  encryptedScore: string;
  publicViews: number;
  timestamp: number;
  creator: string;
  isVerified?: boolean;
  decryptedScore?: number;
}

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const [loading, setLoading] = useState(true);
  const [newsItems, setNewsItems] = useState<NewsItem[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creatingNews, setCreatingNews] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ 
    visible: false, 
    status: "pending", 
    message: "" 
  });
  const [newNewsData, setNewNewsData] = useState({ title: "", category: "tech", score: "" });
  const [selectedNews, setSelectedNews] = useState<NewsItem | null>(null);
  const [decryptedScore, setDecryptedScore] = useState<number | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [contractAddress, setContractAddress] = useState("");
  const [fhevmInitializing, setFhevmInitializing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [showStats, setShowStats] = useState(false);

  const { status, initialize, isInitialized } = useFhevm();
  const { encrypt, isEncrypting } = useEncrypt();
  const { verifyDecryption, isDecrypting: fheIsDecrypting } = useDecrypt();

  useEffect(() => {
    const initFhevmAfterConnection = async () => {
      if (!isConnected || isInitialized || fhevmInitializing) return;
      
      try {
        setFhevmInitializing(true);
        await initialize();
      } catch (error) {
        setTransactionStatus({ 
          visible: true, 
          status: "error", 
          message: "FHEVM initialization failed" 
        });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      } finally {
        setFhevmInitializing(false);
      }
    };

    initFhevmAfterConnection();
  }, [isConnected, isInitialized, initialize, fhevmInitializing]);

  useEffect(() => {
    const loadDataAndContract = async () => {
      if (!isConnected) {
        setLoading(false);
        return;
      }
      
      try {
        await loadData();
        const contract = await getContractReadOnly();
        if (contract) setContractAddress(await contract.getAddress());
      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadDataAndContract();
  }, [isConnected]);

  const loadData = async () => {
    if (!isConnected) return;
    
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const businessIds = await contract.getAllBusinessIds();
      const newsList: NewsItem[] = [];
      
      for (const businessId of businessIds) {
        try {
          const businessData = await contract.getBusinessData(businessId);
          newsList.push({
            id: parseInt(businessId.replace('news-', '')) || Date.now(),
            title: businessData.name,
            category: getCategoryFromValue(businessData.publicValue1),
            encryptedScore: businessId,
            publicViews: Number(businessData.publicValue2) || 0,
            timestamp: Number(businessData.timestamp),
            creator: businessData.creator,
            isVerified: businessData.isVerified,
            decryptedScore: Number(businessData.decryptedValue) || 0
          });
        } catch (e) {
          console.error('Error loading business data:', e);
        }
      }
      
      setNewsItems(newsList);
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Failed to load data" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setIsRefreshing(false); 
    }
  };

  const getCategoryFromValue = (value: number): string => {
    const categories = ["tech", "politics", "sports", "entertainment", "science"];
    return categories[value % categories.length] || "general";
  };

  const createNews = async () => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return; 
    }
    
    setCreatingNews(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Creating news with FHE encryption..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const scoreValue = parseInt(newNewsData.score) || 0;
      const businessId = `news-${Date.now()}`;
      const categoryValue = ["tech", "politics", "sports", "entertainment", "science"].indexOf(newNewsData.category);
      
      const encryptedResult = await encrypt(contractAddress, address, scoreValue);
      
      const tx = await contract.createBusinessData(
        businessId,
        newNewsData.title,
        encryptedResult.encryptedData,
        encryptedResult.proof,
        categoryValue,
        Math.floor(Math.random() * 1000),
        "Encrypted News Item"
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Waiting for transaction confirmation..." });
      await tx.wait();
      
      setTransactionStatus({ visible: true, status: "success", message: "News created successfully!" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      await loadData();
      setShowCreateModal(false);
      setNewNewsData({ title: "", category: "tech", score: "" });
    } catch (e: any) {
      const errorMessage = e.message?.includes("user rejected transaction") 
        ? "Transaction rejected by user" 
        : "Submission failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setCreatingNews(false); 
    }
  };

  const decryptScore = async (businessId: string): Promise<number | null> => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    }
    
    setIsDecrypting(true);
    try {
      const contractRead = await getContractReadOnly();
      if (!contractRead) return null;
      
      const businessData = await contractRead.getBusinessData(businessId);
      if (businessData.isVerified) {
        const storedValue = Number(businessData.decryptedValue) || 0;
        setTransactionStatus({ visible: true, status: "success", message: "Data already verified on-chain" });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
        return storedValue;
      }
      
      const contractWrite = await getContractWithSigner();
      if (!contractWrite) return null;
      
      const encryptedValueHandle = await contractRead.getEncryptedValue(businessId);
      
      const result = await verifyDecryption(
        [encryptedValueHandle],
        contractAddress,
        (abiEncodedClearValues: string, decryptionProof: string) => 
          contractWrite.verifyDecryption(businessId, abiEncodedClearValues, decryptionProof)
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Verifying decryption on-chain..." });
      
      const clearValue = result.decryptionResult.clearValues[encryptedValueHandle];
      
      await loadData();
      
      setTransactionStatus({ visible: true, status: "success", message: "Score decrypted and verified!" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
      
      return Number(clearValue);
      
    } catch (e: any) { 
      if (e.message?.includes("Data already verified")) {
        setTransactionStatus({ visible: true, status: "success", message: "Data is already verified" });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
        await loadData();
        return null;
      }
      
      setTransactionStatus({ visible: true, status: "error", message: "Decryption failed: " + (e.message || "Unknown error") });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    } finally { 
      setIsDecrypting(false); 
    }
  };

  const checkAvailability = async () => {
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const available = await contract.isAvailable();
      setTransactionStatus({ visible: true, status: "success", message: "Contract is available and ready!" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Availability check failed" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const filteredNews = newsItems.filter(item => {
    const matchesSearch = item.title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === "all" || item.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const categories = ["all", "tech", "politics", "sports", "entertainment", "science"];

  if (!isConnected) {
    return (
      <div className="app-container">
        <header className="app-header">
          <div className="logo">
            <h1>Confidential News Feed 🔐</h1>
          </div>
          <div className="header-actions">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </header>
        
        <div className="connection-prompt">
          <div className="connection-content">
            <div className="connection-icon">🔐</div>
            <h2>Connect Your Wallet</h2>
            <p>Please connect your wallet to access the encrypted news feed with FHE protection.</p>
          </div>
        </div>
      </div>
    );
  }

  if (!isInitialized || fhevmInitializing) {
    return (
      <div className="loading-screen">
        <div className="fhe-spinner"></div>
        <p>Initializing FHE Encryption System...</p>
      </div>
    );
  }

  if (loading) return (
    <div className="loading-screen">
      <div className="fhe-spinner"></div>
      <p>Loading encrypted news feed...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <h1>Confidential News Feed 🔐</h1>
          <p>Privacy-preserving news aggregation with FHE</p>
        </div>
        
        <div className="header-actions">
          <button onClick={checkAvailability} className="availability-btn">Check Availability</button>
          <button onClick={() => setShowStats(!showStats)} className="stats-btn">
            {showStats ? "Hide Stats" : "Show Stats"}
          </button>
          <button onClick={() => setShowCreateModal(true)} className="create-btn">+ Add News</button>
          <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
        </div>
      </header>
      
      <div className="main-content">
        <div className="controls-section">
          <div className="search-bar">
            <input 
              type="text" 
              placeholder="Search news..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          
          <div className="category-filters">
            {categories.map(cat => (
              <button 
                key={cat}
                className={`category-btn ${selectedCategory === cat ? 'active' : ''}`}
                onClick={() => setSelectedCategory(cat)}
              >
                {cat}
              </button>
            ))}
          </div>
          
          <button onClick={loadData} className="refresh-btn" disabled={isRefreshing}>
            {isRefreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        {showStats && (
          <div className="stats-panel">
            <div className="stat-item">
              <span>Total News</span>
              <strong>{newsItems.length}</strong>
            </div>
            <div className="stat-item">
              <span>Verified</span>
              <strong>{newsItems.filter(item => item.isVerified).length}</strong>
            </div>
            <div className="stat-item">
              <span>Categories</span>
              <strong>{new Set(newsItems.map(item => item.category)).size}</strong>
            </div>
          </div>
        )}

        <div className="news-grid">
          {filteredNews.length === 0 ? (
            <div className="no-news">
              <p>No news items found</p>
              <button onClick={() => setShowCreateModal(true)} className="create-btn">
                Add First News Item
              </button>
            </div>
          ) : (
            filteredNews.map((item, index) => (
              <div 
                className={`news-card ${item.isVerified ? 'verified' : ''}`}
                key={index}
                onClick={() => setSelectedNews(item)}
              >
                <div className="news-header">
                  <span className="category-badge">{item.category}</span>
                  {item.isVerified && <span className="verified-badge">✅ Verified</span>}
                </div>
                <h3 className="news-title">{item.title}</h3>
                <div className="news-meta">
                  <span>Views: {item.publicViews}</span>
                  <span>{new Date(item.timestamp * 1000).toLocaleDateString()}</span>
                </div>
                <div className="news-score">
                  Score: {item.isVerified ? item.decryptedScore : "🔒 Encrypted"}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
      
      {showCreateModal && (
        <div className="modal-overlay">
          <div className="create-news-modal">
            <div className="modal-header">
              <h2>Add Encrypted News</h2>
              <button onClick={() => setShowCreateModal(false)} className="close-modal">&times;</button>
            </div>
            
            <div className="modal-body">
              <div className="form-group">
                <label>News Title *</label>
                <input 
                  type="text" 
                  value={newNewsData.title}
                  onChange={(e) => setNewNewsData({...newNewsData, title: e.target.value})}
                  placeholder="Enter news title..."
                />
              </div>
              
              <div className="form-group">
                <label>Category *</label>
                <select 
                  value={newNewsData.category}
                  onChange={(e) => setNewNewsData({...newNewsData, category: e.target.value})}
                >
                  <option value="tech">Technology</option>
                  <option value="politics">Politics</option>
                  <option value="sports">Sports</option>
                  <option value="entertainment">Entertainment</option>
                  <option value="science">Science</option>
                </select>
              </div>
              
              <div className="form-group">
                <label>Quality Score (Integer) *</label>
                <input 
                  type="number" 
                  value={newNewsData.score}
                  onChange={(e) => setNewNewsData({...newNewsData, score: e.target.value})}
                  placeholder="Enter quality score..."
                  min="0"
                />
                <div className="help-text">This value will be FHE encrypted</div>
              </div>
            </div>
            
            <div className="modal-footer">
              <button onClick={() => setShowCreateModal(false)} className="cancel-btn">Cancel</button>
              <button 
                onClick={createNews}
                disabled={creatingNews || isEncrypting || !newNewsData.title || !newNewsData.score}
                className="submit-btn"
              >
                {creatingNews || isEncrypting ? "Encrypting..." : "Add News"}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {selectedNews && (
        <div className="modal-overlay">
          <div className="news-detail-modal">
            <div className="modal-header">
              <h2>News Details</h2>
              <button onClick={() => {
                setSelectedNews(null);
                setDecryptedScore(null);
              }} className="close-modal">&times;</button>
            </div>
            
            <div className="modal-body">
              <div className="news-info">
                <h3>{selectedNews.title}</h3>
                <div className="info-grid">
                  <div className="info-item">
                    <span>Category:</span>
                    <strong>{selectedNews.category}</strong>
                  </div>
                  <div className="info-item">
                    <span>Views:</span>
                    <strong>{selectedNews.publicViews}</strong>
                  </div>
                  <div className="info-item">
                    <span>Created:</span>
                    <strong>{new Date(selectedNews.timestamp * 1000).toLocaleDateString()}</strong>
                  </div>
                  <div className="info-item">
                    <span>Creator:</span>
                    <strong>{selectedNews.creator.substring(0, 8)}...{selectedNews.creator.substring(36)}</strong>
                  </div>
                </div>
                
                <div className="score-section">
                  <h4>Quality Score</h4>
                  <div className="score-display">
                    {selectedNews.isVerified ? (
                      <span className="decrypted-score">{selectedNews.decryptedScore} (Verified)</span>
                    ) : decryptedScore !== null ? (
                      <span className="decrypted-score">{decryptedScore} (Local)</span>
                    ) : (
                      <span className="encrypted-score">🔒 FHE Encrypted</span>
                    )}
                  </div>
                  
                  <button 
                    onClick={async () => {
                      if (decryptedScore !== null) {
                        setDecryptedScore(null);
                      } else {
                        const score = await decryptScore(selectedNews.encryptedScore);
                        if (score !== null) setDecryptedScore(score);
                      }
                    }}
                    disabled={isDecrypting || fheIsDecrypting}
                    className={`decrypt-btn ${(selectedNews.isVerified || decryptedScore !== null) ? 'decrypted' : ''}`}
                  >
                    {isDecrypting || fheIsDecrypting ? "Decrypting..." : 
                     selectedNews.isVerified ? "✅ Verified" : 
                     decryptedScore !== null ? "🔄 Re-decrypt" : "🔓 Decrypt Score"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="fhe-spinner"></div>}
              {transactionStatus.status === "success" && "✓"}
              {transactionStatus.status === "error" && "✗"}
            </div>
            <div className="transaction-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;