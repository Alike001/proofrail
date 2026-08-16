// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

/// @title ProofRail Evidence Registry
/// @notice Accepts signed, passing ProofRail evidence envelopes and preserves
/// their receipt history onchain.
/// @dev The approved attestor evaluates offchain evidence. This contract
/// verifies the attestor, domain, policy bit, validity window, and replay guards.
contract ProofRailEvidenceRegistry is EIP712, Ownable2Step {
    uint16 public constant SCHEMA_VERSION = 1;
    uint16 public constant POLICY_VERSION = 1;
    uint64 public constant RECEIPT_LIFETIME = 1 days;
    uint64 public constant MAX_CLOCK_SKEW = 5 minutes;
    uint64 public constant MAX_CIK = 9_999_999_999;

    bytes32 public constant EVIDENCE_ENVELOPE_TYPEHASH = keccak256(
        "EvidenceEnvelope(bytes32 packetHash,bytes32 pairKey,bytes32 nonce,address publisher,uint64 cik,bytes20 lei,uint64 issuedAt,uint64 expiresAt,uint16 schemaVersion,uint16 policyVersion,bool policyPassed)"
    );

    struct EvidenceEnvelope {
        bytes32 packetHash;
        bytes32 pairKey;
        bytes32 nonce;
        address publisher;
        uint64 cik;
        bytes20 lei;
        uint64 issuedAt;
        uint64 expiresAt;
        uint16 schemaVersion;
        uint16 policyVersion;
        bool policyPassed;
    }

    struct Receipt {
        bytes32 pairKey;
        uint64 cik;
        bytes20 lei;
        uint64 issuedAt;
        uint64 expiresAt;
        uint16 schemaVersion;
        uint16 policyVersion;
        address publisher;
        address attestor;
    }

    error AttestorStatusUnchanged(address attestor, bool approved);
    error EvidenceExpired(uint64 expiresAt);
    error InvalidIdentifier();
    error InvalidPacketHash();
    error InvalidNonce();
    error InvalidPairKey(bytes32 expected, bytes32 received);
    error InvalidSignature();
    error InvalidValidityWindow(uint64 issuedAt, uint64 expiresAt);
    error IssueTimeTooFarInFuture(uint64 issuedAt);
    error NonceAlreadyUsed(bytes32 nonce);
    error PacketAlreadyPublished(bytes32 packetHash);
    error PolicyNotPassed();
    error PublisherMismatch(address expected, address actual);
    error UnauthorizedAttestor(address attestor);
    error UnsupportedVersion(uint16 schemaVersion, uint16 policyVersion);
    error ZeroAddress();

    event AttestorApprovalChanged(address indexed attestor, bool approved);
    event EvidenceReceiptPublished(
        bytes32 indexed packetHash,
        bytes32 indexed pairKey,
        bytes32 indexed nonce,
        uint64 cik,
        bytes20 lei,
        uint64 issuedAt,
        uint64 expiresAt,
        uint16 schemaVersion,
        uint16 policyVersion,
        address publisher,
        address attestor
    );

    mapping(address attestor => bool approved) public approvedAttestors;
    mapping(bytes32 nonce => bool used) public usedNonces;
    mapping(bytes32 packetHash => Receipt receipt) public receipts;
    mapping(bytes32 pairKey => bytes32 packetHash) public latestPacketByPair;

    constructor(address initialOwner, address initialAttestor)
        EIP712("ProofRailEvidenceRegistry", "1")
        Ownable(initialOwner)
    {
        if (initialAttestor == address(0)) revert ZeroAddress();
        approvedAttestors[initialAttestor] = true;
        emit AttestorApprovalChanged(initialAttestor, true);
    }

    /// @notice Adds or removes an application-managed attestor.
    function setAttestor(address attestor, bool approved) external onlyOwner {
        if (attestor == address(0)) revert ZeroAddress();
        if (approvedAttestors[attestor] == approved) {
            revert AttestorStatusUnchanged(attestor, approved);
        }

        approvedAttestors[attestor] = approved;
        emit AttestorApprovalChanged(attestor, approved);
    }

    /// @notice Publishes one passing and unexpired evidence envelope.
    function publishReceipt(EvidenceEnvelope calldata envelope, bytes calldata signature) external {
        _validateEnvelope(envelope);

        bytes32 digest = hashEnvelope(envelope);
        (address attestor, ECDSA.RecoverError recoverError,) = ECDSA.tryRecover(digest, signature);
        if (recoverError != ECDSA.RecoverError.NoError) revert InvalidSignature();
        if (!approvedAttestors[attestor]) revert UnauthorizedAttestor(attestor);

        usedNonces[envelope.nonce] = true;
        receipts[envelope.packetHash] = Receipt({
            pairKey: envelope.pairKey,
            cik: envelope.cik,
            lei: envelope.lei,
            issuedAt: envelope.issuedAt,
            expiresAt: envelope.expiresAt,
            schemaVersion: envelope.schemaVersion,
            policyVersion: envelope.policyVersion,
            publisher: envelope.publisher,
            attestor: attestor
        });
        latestPacketByPair[envelope.pairKey] = envelope.packetHash;

        emit EvidenceReceiptPublished(
            envelope.packetHash,
            envelope.pairKey,
            envelope.nonce,
            envelope.cik,
            envelope.lei,
            envelope.issuedAt,
            envelope.expiresAt,
            envelope.schemaVersion,
            envelope.policyVersion,
            envelope.publisher,
            attestor
        );
    }

    /// @notice Returns the EIP-712 digest an approved attestor must sign.
    function hashEnvelope(EvidenceEnvelope calldata envelope) public view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(
                EVIDENCE_ENVELOPE_TYPEHASH,
                envelope.packetHash,
                envelope.pairKey,
                envelope.nonce,
                envelope.publisher,
                envelope.cik,
                envelope.lei,
                envelope.issuedAt,
                envelope.expiresAt,
                envelope.schemaVersion,
                envelope.policyVersion,
                envelope.policyPassed
            )
        );
        return _hashTypedDataV4(structHash);
    }

    /// @notice Derives the pair key used by both the TypeScript core and contract.
    function computePairKey(uint64 cik, bytes20 lei) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(cik, lei));
    }

    function receiptExists(bytes32 packetHash) external view returns (bool) {
        return receipts[packetHash].attestor != address(0);
    }

    function _validateEnvelope(EvidenceEnvelope calldata envelope) private view {
        if (envelope.packetHash == bytes32(0)) revert InvalidPacketHash();
        if (envelope.nonce == bytes32(0)) revert InvalidNonce();
        if (envelope.publisher == address(0)) revert ZeroAddress();
        if (msg.sender != envelope.publisher) {
            revert PublisherMismatch(envelope.publisher, msg.sender);
        }
        if (envelope.cik == 0 || envelope.cik > MAX_CIK || envelope.lei == bytes20(0)) {
            revert InvalidIdentifier();
        }

        bytes32 expectedPairKey = computePairKey(envelope.cik, envelope.lei);
        if (envelope.pairKey != expectedPairKey) {
            revert InvalidPairKey(expectedPairKey, envelope.pairKey);
        }
        if (envelope.schemaVersion != SCHEMA_VERSION || envelope.policyVersion != POLICY_VERSION) {
            revert UnsupportedVersion(envelope.schemaVersion, envelope.policyVersion);
        }
        if (!envelope.policyPassed) revert PolicyNotPassed();
        if (envelope.issuedAt == 0) {
            revert InvalidValidityWindow(envelope.issuedAt, envelope.expiresAt);
        }
        // Block time is the shared protocol clock. The five-minute bound absorbs
        // normal clock drift without allowing a materially future-dated packet.
        // forge-lint: disable-next-line(block-timestamp)
        if (uint256(envelope.issuedAt) > block.timestamp + MAX_CLOCK_SKEW) {
            revert IssueTimeTooFarInFuture(envelope.issuedAt);
        }
        if (uint256(envelope.expiresAt) != uint256(envelope.issuedAt) + RECEIPT_LIFETIME) {
            revert InvalidValidityWindow(envelope.issuedAt, envelope.expiresAt);
        }
        // Expiry is intentionally enforced against the protocol clock.
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp >= envelope.expiresAt) {
            revert EvidenceExpired(envelope.expiresAt);
        }
        if (receipts[envelope.packetHash].attestor != address(0)) {
            revert PacketAlreadyPublished(envelope.packetHash);
        }
        if (usedNonces[envelope.nonce]) revert NonceAlreadyUsed(envelope.nonce);
    }
}
