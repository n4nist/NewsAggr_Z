pragma solidity ^0.8.24;

import { FHE, euint32, externalEuint32 } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract NewsAggr_Z is ZamaEthereumConfig {
    struct NewsItem {
        string encryptedTags;
        euint32 encryptedScore;
        string encryptedContent;
        address publisher;
        uint256 timestamp;
        uint32 decryptedScore;
        bool isDecrypted;
    }

    mapping(string => NewsItem) public newsItems;
    string[] public newsIds;

    event NewsItemCreated(string indexed newsId, address indexed publisher);
    event NewsItemDecrypted(string indexed newsId, uint32 decryptedScore);

    constructor() ZamaEthereumConfig() {
    }

    function publishNews(
        string calldata newsId,
        string calldata encryptedTags,
        externalEuint32 encryptedScore,
        bytes calldata scoreProof,
        string calldata encryptedContent
    ) external {
        require(bytes(newsItems[newsId].encryptedTags).length == 0, "News item already exists");
        require(FHE.isInitialized(FHE.fromExternal(encryptedScore, scoreProof)), "Invalid encrypted score");

        newsItems[newsId] = NewsItem({
            encryptedTags: encryptedTags,
            encryptedScore: FHE.fromExternal(encryptedScore, scoreProof),
            encryptedContent: encryptedContent,
            publisher: msg.sender,
            timestamp: block.timestamp,
            decryptedScore: 0,
            isDecrypted: false
        });

        FHE.allowThis(newsItems[newsId].encryptedScore);
        FHE.makePubliclyDecryptable(newsItems[newsId].encryptedScore);
        newsIds.push(newsId);

        emit NewsItemCreated(newsId, msg.sender);
    }

    function decryptScore(
        string calldata newsId,
        bytes memory abiEncodedClearScore,
        bytes memory decryptionProof
    ) external {
        require(bytes(newsItems[newsId].encryptedTags).length > 0, "News item does not exist");
        require(!newsItems[newsId].isDecrypted, "Score already decrypted");

        bytes32[] memory cts = new bytes32[](1);
        cts[0] = FHE.toBytes32(newsItems[newsId].encryptedScore);

        FHE.checkSignatures(cts, abiEncodedClearScore, decryptionProof);
        uint32 decodedScore = abi.decode(abiEncodedClearScore, (uint32));

        newsItems[newsId].decryptedScore = decodedScore;
        newsItems[newsId].isDecrypted = true;

        emit NewsItemDecrypted(newsId, decodedScore);
    }

    function getEncryptedScore(string calldata newsId) external view returns (euint32) {
        require(bytes(newsItems[newsId].encryptedTags).length > 0, "News item does not exist");
        return newsItems[newsId].encryptedScore;
    }

    function getNewsItem(string calldata newsId) external view returns (
        string memory encryptedTags,
        string memory encryptedContent,
        address publisher,
        uint256 timestamp,
        bool isDecrypted,
        uint32 decryptedScore
    ) {
        require(bytes(newsItems[newsId].encryptedTags).length > 0, "News item does not exist");
        NewsItem storage item = newsItems[newsId];

        return (
            item.encryptedTags,
            item.encryptedContent,
            item.publisher,
            item.timestamp,
            item.isDecrypted,
            item.decryptedScore
        );
    }

    function getAllNewsIds() external view returns (string[] memory) {
        return newsIds;
    }

    function serviceStatus() public pure returns (bool) {
        return true;
    }
}

