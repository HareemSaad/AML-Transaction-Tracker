specVersion: 1.0.0
schema:
  file: ./schema.graphql
description: Pakistan AML risk indicator indexer for the bank custodial-EOA stack.
dataSources:
  - kind: ethereum
    name: ComplianceRegistry
    network: ${SUBGRAPH_NETWORK}
    source:
      address: "${REGISTRY_ADDRESS}"
      abi: ComplianceRegistry
      startBlock: ${DEPLOY_BLOCK}
    mapping:
      kind: ethereum/events
      apiVersion: 0.0.7
      language: wasm/assemblyscript
      file: ./src/registry.ts
      entities: [Wallet, RegistryConfig]
      abis:
        - name: ComplianceRegistry
          file: ./abis/ComplianceRegistry.json
      eventHandlers:
        - event: ProfileSet(indexed address,uint8,bool,bytes32,uint64)
          handler: handleProfileSet
        - event: Blocked(indexed address,bool)
          handler: handleBlocked
        - event: CtrThresholdChanged(uint256)
          handler: handleCtrThresholdChanged
  - kind: ethereum
    name: BankStablecoin
    network: ${SUBGRAPH_NETWORK}
    source:
      address: "${STABLECOIN_ADDRESS}"
      abi: BankStablecoin
      startBlock: ${DEPLOY_BLOCK}
    mapping:
      kind: ethereum/events
      apiVersion: 0.0.7
      language: wasm/assemblyscript
      file: ./src/stablecoin.ts
      entities:
        - Wallet
        - Transfer
        - ComplianceFlag
        - WalletDailyStats
        - KnownCounterparty
        - StructuringWindow
        - SourceFanOut
        - RegistryConfig
      abis:
        - name: BankStablecoin
          file: ./abis/BankStablecoin.json
        - name: ComplianceRegistry
          file: ./abis/ComplianceRegistry.json
      eventHandlers:
        - event: Transfer(indexed address,indexed address,uint256)
          handler: handleTransfer
