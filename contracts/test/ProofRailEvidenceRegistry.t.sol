// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Test} from "forge-std/Test.sol";

import {ProofRailEvidenceRegistry} from "../src/ProofRailEvidenceRegistry.sol";

contract ProofRailEvidenceRegistryTest is Test {
    uint256 private constant ATTESTOR_PRIVATE_KEY = 0xA11CE;
    uint256 private constant OTHER_PRIVATE_KEY = 0xB0B;
    uint64 private constant NOW = 2_000_000_000;
    uint64 private constant CIK = 320_193;
    // The literal is exactly twenty ASCII bytes, so this conversion cannot truncate.
    // forge-lint: disable-next-line(unsafe-typecast)
    bytes20 private constant LEI = bytes20("5493001KJTIIGC8Y1R12");

    ProofRailEvidenceRegistry private registry;
    address private attestor;
    address private publisher;

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

    function setUp() public {
        vm.warp(NOW);
        attestor = vm.addr(ATTESTOR_PRIVATE_KEY);
        publisher = makeAddr("publisher");
        registry = new ProofRailEvidenceRegistry(address(this), attestor);
    }

    function test_PublishesValidReceiptAndStoresMetadata() public {
        ProofRailEvidenceRegistry.EvidenceEnvelope memory envelope = _validEnvelope();
        envelope.publisher = publisher;
        bytes memory signature = _sign(envelope, ATTESTOR_PRIVATE_KEY);

        vm.expectEmit(true, true, true, true, address(registry));
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
            publisher,
            attestor
        );
        vm.prank(publisher);
        registry.publishReceipt(envelope, signature);

        (
            bytes32 pairKey,
            uint64 storedCik,
            bytes20 storedLei,
            uint64 issuedAt,
            uint64 expiresAt,
            uint16 schemaVersion,
            uint16 policyVersion,
            address storedPublisher,
            address storedAttestor
        ) = registry.receipts(envelope.packetHash);

        assertEq(pairKey, envelope.pairKey);
        assertEq(storedCik, CIK);
        assertEq(storedLei, LEI);
        assertEq(issuedAt, NOW);
        assertEq(expiresAt, NOW + 1 days);
        assertEq(schemaVersion, 1);
        assertEq(policyVersion, 1);
        assertEq(storedPublisher, publisher);
        assertEq(storedAttestor, attestor);
        assertTrue(registry.usedNonces(envelope.nonce));
        assertTrue(registry.receiptExists(envelope.packetHash));
        assertEq(registry.latestPacketByPair(envelope.pairKey), envelope.packetHash);
    }

    function test_NewerAcceptanceUpdatesCurrentPointerWithoutDeletingHistory() public {
        ProofRailEvidenceRegistry.EvidenceEnvelope memory first = _validEnvelope();
        first.publisher = publisher;
        bytes memory firstSignature = _sign(first, ATTESTOR_PRIVATE_KEY);
        vm.prank(publisher);
        registry.publishReceipt(first, firstSignature);

        ProofRailEvidenceRegistry.EvidenceEnvelope memory second = first;
        second.packetHash = keccak256("packet-2");
        second.nonce = keccak256("nonce-2");
        second.issuedAt = NOW + 1;
        second.expiresAt = NOW + 1 + 1 days;
        bytes memory secondSignature = _sign(second, ATTESTOR_PRIVATE_KEY);
        vm.prank(publisher);
        registry.publishReceipt(second, secondSignature);

        assertTrue(registry.receiptExists(first.packetHash));
        assertTrue(registry.receiptExists(second.packetHash));
        assertEq(registry.latestPacketByPair(first.pairKey), second.packetHash);
    }

    function test_RevertWhen_PacketWasAlreadyPublished() public {
        ProofRailEvidenceRegistry.EvidenceEnvelope memory envelope = _validEnvelope();
        bytes memory signature = _sign(envelope, ATTESTOR_PRIVATE_KEY);
        registry.publishReceipt(envelope, signature);

        vm.expectRevert(
            abi.encodeWithSelector(ProofRailEvidenceRegistry.PacketAlreadyPublished.selector, envelope.packetHash)
        );
        registry.publishReceipt(envelope, signature);
    }

    function test_RevertWhen_NonceWasUsedByAnotherPacket() public {
        ProofRailEvidenceRegistry.EvidenceEnvelope memory first = _validEnvelope();
        registry.publishReceipt(first, _sign(first, ATTESTOR_PRIVATE_KEY));

        ProofRailEvidenceRegistry.EvidenceEnvelope memory second = first;
        second.packetHash = keccak256("another-packet");
        bytes memory signature = _sign(second, ATTESTOR_PRIVATE_KEY);
        vm.expectRevert(abi.encodeWithSelector(ProofRailEvidenceRegistry.NonceAlreadyUsed.selector, first.nonce));
        registry.publishReceipt(second, signature);
    }

    function test_RevertWhen_PolicyDidNotPass() public {
        ProofRailEvidenceRegistry.EvidenceEnvelope memory envelope = _validEnvelope();
        envelope.policyPassed = false;
        vm.expectRevert(ProofRailEvidenceRegistry.PolicyNotPassed.selector);
        registry.publishReceipt(envelope, "");
    }

    function test_RevertWhen_EnvelopeExpired() public {
        ProofRailEvidenceRegistry.EvidenceEnvelope memory envelope = _validEnvelope();
        envelope.issuedAt = NOW - 1 days;
        envelope.expiresAt = NOW;
        vm.expectRevert(abi.encodeWithSelector(ProofRailEvidenceRegistry.EvidenceExpired.selector, NOW));
        registry.publishReceipt(envelope, "");
    }

    function test_RevertWhen_ValidityWindowIsNotOneDay() public {
        ProofRailEvidenceRegistry.EvidenceEnvelope memory envelope = _validEnvelope();
        envelope.expiresAt += 1;
        vm.expectRevert(
            abi.encodeWithSelector(ProofRailEvidenceRegistry.InvalidValidityWindow.selector, NOW, NOW + 1 days + 1)
        );
        registry.publishReceipt(envelope, "");
    }

    function test_RevertWhen_IssueTimeIsZero() public {
        ProofRailEvidenceRegistry.EvidenceEnvelope memory envelope = _validEnvelope();
        envelope.issuedAt = 0;
        envelope.expiresAt = 1 days;
        vm.expectRevert(abi.encodeWithSelector(ProofRailEvidenceRegistry.InvalidValidityWindow.selector, 0, 1 days));
        registry.publishReceipt(envelope, "");
    }

    function test_RevertWhen_IssueTimeExceedsClockSkew() public {
        ProofRailEvidenceRegistry.EvidenceEnvelope memory envelope = _validEnvelope();
        envelope.issuedAt = NOW + 5 minutes + 1;
        envelope.expiresAt = envelope.issuedAt + 1 days;
        vm.expectRevert(
            abi.encodeWithSelector(ProofRailEvidenceRegistry.IssueTimeTooFarInFuture.selector, envelope.issuedAt)
        );
        registry.publishReceipt(envelope, "");
    }

    function test_RevertWhen_VersionIsUnsupported() public {
        ProofRailEvidenceRegistry.EvidenceEnvelope memory envelope = _validEnvelope();
        envelope.schemaVersion = 2;
        vm.expectRevert(abi.encodeWithSelector(ProofRailEvidenceRegistry.UnsupportedVersion.selector, 2, 1));
        registry.publishReceipt(envelope, "");
    }

    function test_RevertWhen_PairKeyDoesNotMatchIdentifiers() public {
        ProofRailEvidenceRegistry.EvidenceEnvelope memory envelope = _validEnvelope();
        bytes32 expected = envelope.pairKey;
        envelope.pairKey = keccak256("wrong-pair");
        vm.expectRevert(
            abi.encodeWithSelector(ProofRailEvidenceRegistry.InvalidPairKey.selector, expected, envelope.pairKey)
        );
        registry.publishReceipt(envelope, "");
    }

    function test_RevertWhen_PacketHashIsZero() public {
        ProofRailEvidenceRegistry.EvidenceEnvelope memory envelope = _validEnvelope();
        envelope.packetHash = bytes32(0);
        vm.expectRevert(ProofRailEvidenceRegistry.InvalidPacketHash.selector);
        registry.publishReceipt(envelope, "");
    }

    function test_RevertWhen_NonceIsZero() public {
        ProofRailEvidenceRegistry.EvidenceEnvelope memory envelope = _validEnvelope();
        envelope.nonce = bytes32(0);
        vm.expectRevert(ProofRailEvidenceRegistry.InvalidNonce.selector);
        registry.publishReceipt(envelope, "");
    }

    function test_RevertWhen_PublisherIsZeroOrDoesNotMatchSender() public {
        ProofRailEvidenceRegistry.EvidenceEnvelope memory envelope = _validEnvelope();
        envelope.publisher = address(0);
        vm.expectRevert(ProofRailEvidenceRegistry.ZeroAddress.selector);
        registry.publishReceipt(envelope, "");

        envelope = _validEnvelope();
        envelope.publisher = publisher;
        vm.expectRevert(
            abi.encodeWithSelector(ProofRailEvidenceRegistry.PublisherMismatch.selector, publisher, address(this))
        );
        registry.publishReceipt(envelope, "");
    }

    function test_RevertWhen_IdentifierIsInvalid() public {
        ProofRailEvidenceRegistry.EvidenceEnvelope memory envelope = _validEnvelope();
        envelope.cik = 0;
        vm.expectRevert(ProofRailEvidenceRegistry.InvalidIdentifier.selector);
        registry.publishReceipt(envelope, "");

        envelope = _validEnvelope();
        envelope.cik = registry.MAX_CIK() + 1;
        vm.expectRevert(ProofRailEvidenceRegistry.InvalidIdentifier.selector);
        registry.publishReceipt(envelope, "");

        envelope = _validEnvelope();
        envelope.lei = bytes20(0);
        vm.expectRevert(ProofRailEvidenceRegistry.InvalidIdentifier.selector);
        registry.publishReceipt(envelope, "");
    }

    function test_RevertWhen_SignatureEncodingIsInvalid() public {
        ProofRailEvidenceRegistry.EvidenceEnvelope memory envelope = _validEnvelope();
        vm.expectRevert(ProofRailEvidenceRegistry.InvalidSignature.selector);
        registry.publishReceipt(envelope, hex"01");
    }

    function test_RevertWhen_SignerIsNotApproved() public {
        ProofRailEvidenceRegistry.EvidenceEnvelope memory envelope = _validEnvelope();
        address otherSigner = vm.addr(OTHER_PRIVATE_KEY);
        bytes memory signature = _sign(envelope, OTHER_PRIVATE_KEY);
        vm.expectRevert(abi.encodeWithSelector(ProofRailEvidenceRegistry.UnauthorizedAttestor.selector, otherSigner));
        registry.publishReceipt(envelope, signature);
    }

    function test_RevertWhen_SignatureWasCreatedForAnotherRegistry() public {
        ProofRailEvidenceRegistry otherRegistry = new ProofRailEvidenceRegistry(address(this), attestor);
        ProofRailEvidenceRegistry.EvidenceEnvelope memory envelope = _validEnvelope();
        bytes32 otherDigest = otherRegistry.hashEnvelope(envelope);
        bytes memory signature = _signDigest(otherDigest, ATTESTOR_PRIVATE_KEY);

        vm.expectPartialRevert(ProofRailEvidenceRegistry.UnauthorizedAttestor.selector);
        registry.publishReceipt(envelope, signature);
    }

    function test_RevertWhen_ChainIdChangesAfterSigning() public {
        ProofRailEvidenceRegistry.EvidenceEnvelope memory envelope = _validEnvelope();
        bytes memory signature = _sign(envelope, ATTESTOR_PRIVATE_KEY);
        vm.chainId(block.chainid + 1);

        vm.expectPartialRevert(ProofRailEvidenceRegistry.UnauthorizedAttestor.selector);
        registry.publishReceipt(envelope, signature);
    }

    function test_TamperingAfterSigningInvalidatesAttestor() public {
        ProofRailEvidenceRegistry.EvidenceEnvelope memory envelope = _validEnvelope();
        bytes memory signature = _sign(envelope, ATTESTOR_PRIVATE_KEY);
        envelope.packetHash = keccak256("tampered");

        vm.expectPartialRevert(ProofRailEvidenceRegistry.UnauthorizedAttestor.selector);
        registry.publishReceipt(envelope, signature);
    }

    function test_OwnerCanRevokeAndApproveAttestors() public {
        address replacement = makeAddr("replacement");
        vm.expectEmit(true, false, false, true, address(registry));
        emit AttestorApprovalChanged(attestor, false);
        registry.setAttestor(attestor, false);
        assertFalse(registry.approvedAttestors(attestor));

        vm.expectEmit(true, false, false, true, address(registry));
        emit AttestorApprovalChanged(replacement, true);
        registry.setAttestor(replacement, true);
        assertTrue(registry.approvedAttestors(replacement));
    }

    function test_RevertWhen_AttestorChangeIsInvalid() public {
        address outsider = makeAddr("outsider");
        vm.prank(outsider);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, outsider));
        registry.setAttestor(attestor, false);

        vm.expectRevert(ProofRailEvidenceRegistry.ZeroAddress.selector);
        registry.setAttestor(address(0), true);

        vm.expectRevert(
            abi.encodeWithSelector(ProofRailEvidenceRegistry.AttestorStatusUnchanged.selector, attestor, true)
        );
        registry.setAttestor(attestor, true);
    }

    function test_RevokedAttestorCannotPublishNewReceipt() public {
        ProofRailEvidenceRegistry.EvidenceEnvelope memory envelope = _validEnvelope();
        bytes memory signature = _sign(envelope, ATTESTOR_PRIVATE_KEY);
        registry.setAttestor(attestor, false);

        vm.expectRevert(abi.encodeWithSelector(ProofRailEvidenceRegistry.UnauthorizedAttestor.selector, attestor));
        registry.publishReceipt(envelope, signature);
    }

    function test_OwnershipTransferRequiresPendingOwnerAcceptance() public {
        address nextOwner = makeAddr("next-owner");
        registry.transferOwnership(nextOwner);
        assertEq(registry.pendingOwner(), nextOwner);
        assertEq(registry.owner(), address(this));

        vm.prank(nextOwner);
        registry.acceptOwnership();
        assertEq(registry.owner(), nextOwner);
        assertEq(registry.pendingOwner(), address(0));
    }

    function test_RevertWhen_NonPendingAddressAcceptsOwnership() public {
        address outsider = makeAddr("outsider");
        vm.prank(outsider);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, outsider));
        registry.acceptOwnership();
    }

    function test_ComputePairKeyMatchesTypeScriptCoreVector() public view {
        assertEq(registry.computePairKey(CIK, LEI), 0xc9a536cbaec53212d71bb19d076b334fc53ed2563d22725642bae5b70f323c8b);
    }

    function testFuzz_PublishesStructurallyValidEnvelope(uint64 cik, bytes20 lei, bytes32 packetHash, bytes32 nonce)
        public
    {
        cik = uint64(bound(cik, 1, registry.MAX_CIK()));
        vm.assume(lei != bytes20(0));
        vm.assume(packetHash != bytes32(0));
        vm.assume(nonce != bytes32(0));

        ProofRailEvidenceRegistry.EvidenceEnvelope memory envelope = _validEnvelope();
        envelope.cik = cik;
        envelope.lei = lei;
        envelope.pairKey = registry.computePairKey(cik, lei);
        envelope.packetHash = packetHash;
        envelope.nonce = nonce;
        envelope.publisher = publisher;
        bytes memory signature = _sign(envelope, ATTESTOR_PRIVATE_KEY);

        vm.prank(publisher);
        registry.publishReceipt(envelope, signature);
        assertTrue(registry.receiptExists(packetHash));
        assertEq(registry.latestPacketByPair(envelope.pairKey), packetHash);
    }

    function _validEnvelope() private view returns (ProofRailEvidenceRegistry.EvidenceEnvelope memory) {
        return ProofRailEvidenceRegistry.EvidenceEnvelope({
            packetHash: keccak256("packet-1"),
            pairKey: registry.computePairKey(CIK, LEI),
            nonce: keccak256("nonce-1"),
            publisher: address(this),
            cik: CIK,
            lei: LEI,
            issuedAt: NOW,
            expiresAt: NOW + 1 days,
            schemaVersion: 1,
            policyVersion: 1,
            policyPassed: true
        });
    }

    function _sign(ProofRailEvidenceRegistry.EvidenceEnvelope memory envelope, uint256 privateKey)
        private
        view
        returns (bytes memory)
    {
        return _signDigest(registry.hashEnvelope(envelope), privateKey);
    }

    function _signDigest(bytes32 digest, uint256 privateKey) private pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, digest);
        return abi.encodePacked(r, s, v);
    }
}
