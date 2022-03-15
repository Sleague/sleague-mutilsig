import * as anchor from '@project-serum/anchor';
import assert from 'assert';
import { PublicKey, Keypair, Transaction, AccountMeta } from '@solana/web3.js';
import { Program } from '@project-serum/anchor';
import { SleagueMutilsig } from '../target/types/sleague_mutilsig';

describe('002-set-league', () => {

  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.Provider.env());

  const lamports = 1000_000_000;

  const program = anchor.workspace.SleagueMutilsig as Program<SleagueMutilsig>;
  const members = [Keypair.generate(), Keypair.generate(), Keypair.generate()];
  const leagueKey = Keypair.generate();
  const txKey = Keypair.generate();

  it('Create league!', async () => {
    const [leagueSigner, bump] = await anchor.web3.PublicKey.findProgramAddress([Buffer.from("league_signer"), leagueKey.publicKey.toBuffer()], program.programId);
    await program.rpc.createLeague(members.map((m) => m.publicKey), new anchor.BN(2), bump, {
      accounts: {
        league: leagueKey.publicKey,
        leagueSigner,
        payer: program.provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId
      },
      signers:[leagueKey]
    });

  });

  it('Transfer 1000 lamport to program!', async () => {
    const leagueSigner = (await anchor.web3.PublicKey.findProgramAddress([Buffer.from("league_signer"), leagueKey.publicKey.toBuffer()], program.programId))[0];
    
    const ix = anchor.web3.SystemProgram.transfer({fromPubkey: program.provider.wallet.publicKey, toPubkey: leagueSigner, lamports})
    const tx = new Transaction();

    tx.add(ix);
    await program.provider.send(tx);

    const balance = await program.provider.connection.getBalance(leagueSigner);

    assert.ok(balance === lamports);
  });

  it('Create transaction!', async () => {
    
    const leagueSigner = (await anchor.web3.PublicKey.findProgramAddress([Buffer.from("league_signer"), leagueKey.publicKey.toBuffer()], program.programId))[0];

    const ix = anchor.web3.SystemProgram.transfer({fromPubkey: leagueSigner, toPubkey: program.provider.wallet.publicKey, lamports})

    await program.rpc.createTransaction(ix.programId, ix.keys, ix.data, new anchor.BN(0), {
      accounts: {
        league: leagueKey.publicKey,
        transaction: txKey.publicKey,
        member: members[0].publicKey,
        payer: program.provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      },
      signers:[txKey, members[0]]
    });

    const txAccount = await program.account.transaction.fetch(txKey.publicKey);

    
    assert.ok(ix.data.equals(txAccount.data as Buffer));
    assert.ok(txAccount.program.equals(ix.programId));
    assert.ok(txAccount.endTime.eqn(0));
    assert.ok(JSON.stringify(txAccount.state) === JSON.stringify({none:{}}));

    assert.ok(txAccount.approval[0] === true);
    assert.ok(txAccount.approval[1] === null);
    assert.ok(txAccount.approval[2] === null);
  });

  
  it('Approve transaction!', async () => {
    await program.rpc.approveTransaction(true, {
      accounts: {
        league: leagueKey.publicKey,
        transaction: txKey.publicKey,
        member: members[1].publicKey,
      },
      signers:[members[1]]
    });

    const txAccount = await program.account.transaction.fetch(txKey.publicKey);

    assert.ok(JSON.stringify(txAccount.state) === JSON.stringify({accepted:{}}));

    assert.ok(txAccount.approval[0] === true);
    assert.ok(txAccount.approval[1] === true);
    assert.ok(txAccount.approval[2] === null);
  });

  
  it('Exec transaction!', async () => {
    const leagueSigner = (await anchor.web3.PublicKey.findProgramAddress([Buffer.from("league_signer"), leagueKey.publicKey.toBuffer()], program.programId))[0];
    let txAccount = await program.account.transaction.fetch(txKey.publicKey);

    await program.rpc.execTransaction({
      accounts: {
        league: leagueKey.publicKey,
        transaction: txKey.publicKey,
      },
      remainingAccounts: 
        (txAccount.accounts as AccountMeta[]).map((account) =>
          account.pubkey.equals(leagueSigner)
              ? { ...account, isSigner: false }
              : account
        ).concat({
          pubkey: txAccount.program,
          isWritable: false,
          isSigner: false,
        }),
    });

    txAccount = await program.account.transaction.fetch(txKey.publicKey);

    assert.ok(JSON.stringify(txAccount.state) === JSON.stringify({execed:{}}));

    const balance = await program.provider.connection.getBalance(leagueSigner);

    assert.ok(balance === 0);

  });
});