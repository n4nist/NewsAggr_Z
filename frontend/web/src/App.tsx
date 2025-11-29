import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { getContractReadOnly, getContractWithSigner } from "./components/useContract";
import "./App.css";
import { useAccount } from 'wagmi';
import { useFhevm, useEncrypt, useDecrypt } from '../fhevm-sdk/src';
import { ethers } from 'ethers';

interface NewsItem {
  id: string;
  title: string;
  category: string;
  source: string;
  timestamp: number;
  creator: string;
  publicValue1: number;
  publicValue2: number;
  isVerified?: boolean;
  decryptedValue?: number;
  encryptedValueHandle?: string;
  description: string;
}

interface NewsStats {
  totalNews: number;
  verifiedNews: number;
  avgEngagement: number;
  trendingCount: number;
  categories: {[key: string]: number};
}

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const [loading, setLoading] = useState(true);
  const [newsItems, setNewsItems] = useState<NewsItem[]>([]);
  const [filteredNews, setFilteredNews] = useState<NewsItem[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creatingNews, setCreatingNews] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ 
    visible: false, 
    status: "pending" as const, 
    message: "" 
  });
  const [newNewsData, setNewNewsData] = useState({ 
    title: "", 
    category: "科技", 
    engagement: "", 
    description: "" 
  });
  const [selectedNews, setSelectedNews] = useState<NewsItem | null>(null);
  const [decryptedData, setDecryptedData] = useState<number | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [contractAddress, setContractAddress] = useState("");
  const [fhevmInitializing, setFhevmInitializing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(6);
  const [userHistory, setUserHistory] = useState<string[]>([]);
  const [showFAQ, setShowFAQ] = useState(false);
  const [stats, setStats] = useState<NewsStats>({
    totalNews: 0,
    verifiedNews: 0,
    avgEngagement: 0,
    trendingCount: 0,
    categories: {}
  });

  const { status, initialize, isInitialized } = useFhevm();
  const { encrypt, isEncrypting } = useEncrypt();
  const { verifyDecryption, isDecrypting: fheIsDecrypting } = useDecrypt();

  const categories = ["科技", "政治", "经济", "娱乐", "体育", "健康", "教育", "国际"];

  useEffect(() => {
    const initFhevmAfterConnection = async () => {
      if (!isConnected) return;
      if (isInitialized || fhevmInitializing) return;
      
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

  useEffect(() => {
    filterNews();
  }, [newsItems, searchQuery, currentPage]);

  const filterNews = () => {
    let filtered = newsItems;
    
    if (searchQuery) {
      filtered = filtered.filter(item => 
        item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.source.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    
    setFilteredNews(filtered);
    updateStats(filtered);
  };

  const updateStats = (items: NewsItem[]) => {
    const categoriesCount: {[key: string]: number} = {};
    items.forEach(item => {
      categoriesCount[item.category] = (categoriesCount[item.category] || 0) + 1;
    });

    const totalEngagement = items.reduce((sum, item) => sum + item.publicValue1, 0);
    
    setStats({
      totalNews: items.length,
      verifiedNews: items.filter(item => item.isVerified).length,
      avgEngagement: items.length > 0 ? totalEngagement / items.length : 0,
      trendingCount: items.filter(item => item.publicValue1 > 5).length,
      categories: categoriesCount
    });
  };

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
            id: businessId,
            title: businessData.name,
            category: categories[Number(businessData.publicValue2) % categories.length] || "科技",
            source: "加密新闻源",
            timestamp: Number(businessData.timestamp),
            creator: businessData.creator,
            publicValue1: Number(businessData.publicValue1) || 0,
            publicValue2: Number(businessData.publicValue2) || 0,
            isVerified: businessData.isVerified,
            decryptedValue: Number(businessData.decryptedValue) || 0,
            description: businessData.description
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

  const createNews = async () => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "请先连接钱包" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return; 
    }
    
    setCreatingNews(true);
    setTransactionStatus({ visible: true, status: "pending", message: "使用Zama FHE创建加密新闻..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const engagementValue = parseInt(newNewsData.engagement) || 0;
      const businessId = `news-${Date.now()}`;
      const categoryIndex = categories.indexOf(newNewsData.category);
      
      const encryptedResult = await encrypt(contractAddress, address, engagementValue);
      
      const tx = await contract.createBusinessData(
        businessId,
        newNewsData.title,
        encryptedResult.encryptedData,
        encryptedResult.proof,
        engagementValue,
        categoryIndex,
        newNewsData.description
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "等待交易确认..." });
      await tx.wait();
      
      setUserHistory(prev => [...prev, `创建新闻: ${newNewsData.title}`]);
      setTransactionStatus({ visible: true, status: "success", message: "新闻创建成功!" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      await loadData();
      setShowCreateModal(false);
      setNewNewsData({ title: "", category: "科技", engagement: "", description: "" });
    } catch (e: any) {
      const errorMessage = e.message?.includes("user rejected transaction") 
        ? "用户取消交易" 
        : "提交失败: " + (e.message || "未知错误");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setCreatingNews(false); 
    }
  };

  const decryptData = async (businessId: string): Promise<number | null> => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "请先连接钱包" });
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
        setTransactionStatus({ visible: true, status: "success", message: "数据已在链上验证" });
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
      
      setTransactionStatus({ visible: true, status: "pending", message: "链上验证解密中..." });
      const clearValue = result.decryptionResult.clearValues[encryptedValueHandle];
      
      await loadData();
      setUserHistory(prev => [...prev, `解密新闻: ${businessData.name}`]);
      setTransactionStatus({ visible: true, status: "success", message: "数据解密验证成功!" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
      
      return Number(clearValue);
      
    } catch (e: any) { 
      if (e.message?.includes("Data already verified")) {
        setTransactionStatus({ visible: true, status: "success", message: "数据已在链上验证" });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
        await loadData();
        return null;
      }
      
      setTransactionStatus({ visible: true, status: "error", message: "解密失败: " + (e.message || "未知错误") });
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
      setTransactionStatus({ visible: true, status: "success", message: "合约可用性检查成功!" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "可用性检查失败" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const renderStats = () => {
    return (
      <div className="stats-grid">
        <div className="stat-card neon-purple">
          <h3>总新闻数</h3>
          <div className="stat-value">{stats.totalNews}</div>
          <div className="stat-trend">+{stats.trendingCount} 热门</div>
        </div>
        
        <div className="stat-card neon-blue">
          <h3>已验证数据</h3>
          <div className="stat-value">{stats.verifiedNews}/{stats.totalNews}</div>
          <div className="stat-trend">FHE保护</div>
        </div>
        
        <div className="stat-card neon-pink">
          <h3>平均参与度</h3>
          <div className="stat-value">{stats.avgEngagement.toFixed(1)}/10</div>
          <div className="stat-trend">加密统计</div>
        </div>
        
        <div className="stat-card neon-green">
          <h3>分类分布</h3>
          <div className="stat-value">{Object.keys(stats.categories).length}</div>
          <div className="stat-trend">个分类</div>
        </div>
      </div>
    );
  };

  const renderNewsGrid = () => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const currentItems = filteredNews.slice(startIndex, startIndex + itemsPerPage);
    const totalPages = Math.ceil(filteredNews.length / itemsPerPage);

    return (
      <div className="news-grid-container">
        <div className="news-grid">
          {currentItems.map((news, index) => (
            <div 
              className={`news-card ${news.isVerified ? "verified" : ""}`}
              key={news.id}
              onClick={() => setSelectedNews(news)}
            >
              <div className="news-category">{news.category}</div>
              <div className="news-title">{news.title}</div>
              <div className="news-meta">
                <span>来源: {news.source}</span>
                <span>时间: {new Date(news.timestamp * 1000).toLocaleDateString()}</span>
              </div>
              <div className="news-stats">
                <div className="engagement-score">
                  参与度: {news.publicValue1}/10
                </div>
                <div className={`verification-status ${news.isVerified ? "verified" : "pending"}`}>
                  {news.isVerified ? "✅ 已验证" : "🔒 待验证"}
                </div>
              </div>
              {news.isVerified && news.decryptedValue && (
                <div className="decrypted-value">
                  加密评分: {news.decryptedValue}
                </div>
              )}
            </div>
          ))}
        </div>
        
        {totalPages > 1 && (
          <div className="pagination">
            <button 
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="page-btn"
            >
              上一页
            </button>
            
            {Array.from({length: Math.min(5, totalPages)}, (_, i) => {
              const page = currentPage <= 3 ? i + 1 : 
                         currentPage >= totalPages - 2 ? totalPages - 4 + i : 
                         currentPage - 2 + i;
              return page > 0 && page <= totalPages ? (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={`page-btn ${currentPage === page ? "active" : ""}`}
                >
                  {page}
                </button>
              ) : null;
            })}
            
            <button 
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="page-btn"
            >
              下一页
            </button>
          </div>
        )}
      </div>
    );
  };

  const renderUserHistory = () => {
    return (
      <div className="history-panel">
        <h3>用户操作记录</h3>
        <div className="history-list">
          {userHistory.slice(-5).map((record, index) => (
            <div key={index} className="history-item">
              {record}
            </div>
          ))}
          {userHistory.length === 0 && <div className="no-history">暂无操作记录</div>}
        </div>
      </div>
    );
  };

  const renderFAQ = () => {
    return (
      <div className="faq-modal">
        <div className="faq-content">
          <h2>常见问题解答</h2>
          <div className="faq-item">
            <h4>什么是FHE加密新闻？</h4>
            <p>全同态加密技术保护新闻参与度数据，实现隐私保护的个性化推荐。</p>
          </div>
          <div className="faq-item">
            <h4>如何验证加密数据？</h4>
            <p>点击"验证解密"按钮，系统会进行离线解密和链上验证。</p>
          </div>
          <div className="faq-item">
            <h4>数据是否安全？</h4>
            <p>所有敏感数据都经过Zama FHE加密，只有用户可解密查看。</p>
          </div>
          <button onClick={() => setShowFAQ(false)} className="close-faq">关闭</button>
        </div>
      </div>
    );
  };

  if (!isConnected) {
    return (
      <div className="app-container">
        <header className="app-header">
          <div className="logo">
            <h1>🔐 隐私新闻流</h1>
          </div>
          <div className="header-actions">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </header>
        
        <div className="connection-prompt">
          <div className="connection-content">
            <div className="connection-icon">🔐</div>
            <h2>连接钱包开始使用</h2>
            <p>连接您的钱包来初始化加密新闻系统，体验隐私保护的新闻阅读。</p>
          </div>
        </div>
      </div>
    );
  }

  if (!isInitialized || fhevmInitializing) {
    return (
      <div className="loading-screen">
        <div className="fhe-spinner"></div>
        <p>初始化FHE加密系统...</p>
      </div>
    );
  }

  if (loading) return (
    <div className="loading-screen">
      <div className="fhe-spinner"></div>
      <p>加载加密新闻系统...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <h1>🔐 隐私新闻流</h1>
          <p>FHE保护的个性化新闻推荐</p>
        </div>
        
        <div className="header-actions">
          <div className="action-group">
            <button onClick={checkAvailability} className="action-btn neon-blue">
              检查可用性
            </button>
            <button onClick={() => setShowCreateModal(true)} className="action-btn neon-pink">
              发布新闻
            </button>
            <button onClick={() => setShowFAQ(true)} className="action-btn neon-green">
              常见问题
            </button>
          </div>
          <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
        </div>
      </header>
      
      <div className="main-content">
        <div className="search-section">
          <div className="search-bar">
            <input
              type="text"
              placeholder="搜索新闻标题、分类或来源..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
            />
            <button className="search-btn">搜索</button>
          </div>
          <div className="search-stats">
            找到 {filteredNews.length} 条新闻
            {searchQuery && <span>，关键词: "{searchQuery}"</span>}
          </div>
        </div>
        
        {renderStats()}
        
        <div className="content-grid">
          <div className="news-section">
            <div className="section-header">
              <h2>加密新闻流</h2>
              <button onClick={loadData} className="refresh-btn" disabled={isRefreshing}>
                {isRefreshing ? "刷新中..." : "刷新"}
              </button>
            </div>
            {renderNewsGrid()}
          </div>
          
          <div className="sidebar">
            {renderUserHistory()}
            <div className="info-panel">
              <h3>FHE加密流程</h3>
              <div className="fhe-flow">
                <div className="flow-step">1. 数据加密</div>
                <div className="flow-step">2. 链上存储</div>
                <div className="flow-step">3. 离线解密</div>
                <div className="flow-step">4. 链上验证</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {showCreateModal && (
        <CreateNewsModal 
          onSubmit={createNews} 
          onClose={() => setShowCreateModal(false)} 
          creating={creatingNews} 
          newsData={newNewsData} 
          setNewsData={setNewNewsData}
          isEncrypting={isEncrypting}
          categories={categories}
        />
      )}
      
      {selectedNews && (
        <NewsDetailModal 
          news={selectedNews} 
          onClose={() => { 
            setSelectedNews(null); 
            setDecryptedData(null); 
          }} 
          decryptedData={decryptedData} 
          isDecrypting={isDecrypting || fheIsDecrypting} 
          decryptData={() => decryptData(selectedNews.id)}
        />
      )}
      
      {showFAQ && renderFAQ()}
      
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

const CreateNewsModal: React.FC<{
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  newsData: any;
  setNewsData: (data: any) => void;
  isEncrypting: boolean;
  categories: string[];
}> = ({ onSubmit, onClose, creating, newsData, setNewsData, isEncrypting, categories }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    if (name === 'engagement') {
      const intValue = value.replace(/[^\d]/g, '');
      setNewsData({ ...newsData, [name]: intValue });
    } else {
      setNewsData({ ...newsData, [name]: value });
    }
  };

  return (
    <div className="modal-overlay">
      <div className="create-news-modal">
        <div className="modal-header">
          <h2>发布加密新闻</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice">
            <strong>FHE 🔐 加密保护</strong>
            <p>新闻参与度数据将使用Zama FHE加密（仅支持整数）</p>
          </div>
          
          <div className="form-group">
            <label>新闻标题 *</label>
            <input 
              type="text" 
              name="title" 
              value={newsData.title} 
              onChange={handleChange} 
              placeholder="输入新闻标题..." 
            />
          </div>
          
          <div className="form-group">
            <label>新闻分类 *</label>
            <select name="category" value={newsData.category} onChange={handleChange}>
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
          
          <div className="form-group">
            <label>参与度评分 (1-10) *</label>
            <input 
              type="number" 
              min="1" 
              max="10" 
              name="engagement" 
              value={newsData.engagement} 
              onChange={handleChange} 
              placeholder="输入参与度评分..." 
            />
            <div className="data-type-label">FHE加密整数</div>
          </div>
          
          <div className="form-group">
            <label>新闻描述</label>
            <textarea 
              name="description" 
              value={newsData.description} 
              onChange={handleChange} 
              placeholder="输入新闻描述..." 
              rows={3}
            />
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="cancel-btn">取消</button>
          <button 
            onClick={onSubmit} 
            disabled={creating || isEncrypting || !newsData.title || !newsData.engagement} 
            className="submit-btn"
          >
            {creating || isEncrypting ? "加密并发布中..." : "发布新闻"}
          </button>
        </div>
      </div>
    </div>
  );
};

const NewsDetailModal: React.FC<{
  news: NewsItem;
  onClose: () => void;
  decryptedData: number | null;
  isDecrypting: boolean;
  decryptData: () => Promise<number | null>;
}> = ({ news, onClose, decryptedData, isDecrypting, decryptData }) => {
  const handleDecrypt = async () => {
    if (decryptedData !== null) return;
    await decryptData();
  };

  return (
    <div className="modal-overlay">
      <div className="news-detail-modal">
        <div className="modal-header">
          <h2>新闻详情</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="news-info">
            <div className="info-row">
              <span>标题:</span>
              <strong>{news.title}</strong>
            </div>
            <div className="info-row">
              <span>分类:</span>
              <strong>{news.category}</strong>
            </div>
            <div className="info-row">
              <span>来源:</span>
              <strong>{news.source}</strong>
            </div>
            <div className="info-row">
              <span>发布时间:</span>
              <strong>{new Date(news.timestamp * 1000).toLocaleString()}</strong>
            </div>
            <div className="info-row">
              <span>创建者:</span>
              <strong>{news.creator.substring(0, 6)}...{news.creator.substring(38)}</strong>
            </div>
          </div>
          
          <div className="data-section">
            <h3>加密数据</h3>
            <div className="data-row">
              <div className="data-label">参与度评分:</div>
              <div className="data-value">
                {news.isVerified && news.decryptedValue ? 
                  `${news.decryptedValue} (链上已验证)` : 
                  decryptedData !== null ? 
                  `${decryptedData} (本地已解密)` : 
                  "🔒 FHE加密整数"
                }
              </div>
              <button 
                className={`decrypt-btn ${(news.isVerified || decryptedData !== null) ? 'decrypted' : ''}`}
                onClick={handleDecrypt} 
                disabled={isDecrypting}
              >
                {isDecrypting ? "🔓 验证中..." : 
                 news.isVerified ? "✅ 已验证" : 
                 decryptedData !== null ? "🔄 重新验证" : 
                 "🔓 验证解密"}
              </button>
            </div>
          </div>
          
          <div className="description-section">
            <h3>新闻内容</h3>
            <p>{news.description || "暂无详细描述"}</p>
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="close-btn">关闭</button>
          {!news.isVerified && (
            <button onClick={handleDecrypt} disabled={isDecrypting} className="verify-btn">
              {isDecrypting ? "验证中..." : "链上验证"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default App;