# sleague-mutilsig
Sleague is a multi-functional decentralized multi-signature platform for Solana. It aims to maintain the security of various assets in the Solana ecosystem through decentralized multi-signature governance. The Sleague platform supports multi-signature management services for multiple assets.

Users can create multiple user groups in Sleague. In a multi-signature user group, each group member can propose a transaction, which can be seen by other members, meanwhile they can choose execute or not. The transaction will be executed successfully once the agreed number reaches the threshold.
## Setup
Install Rust: 
```
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source $HOME/.cargo/env
rustup component add rustfmt
```
Install Solana: 
```
sh -c "$(curl -sSfL https://release.solana.com/v1.8.16/install)"
```

Install Anchor: 
```
npm i -g @project-serum/anchor-cli@0.18.2
cargo install --git https://github.com/project-serum/anchor --tag v0.18.2 anchor-cli --locked

```
## Clone
Clone this repo:
```
git clone https://github.com/Sleague/sleague-mutilsig.git
```
## Run the test
First, install the dependencies
```
npm install
anchor build
```
Then, run the test
```
anchor test
```
