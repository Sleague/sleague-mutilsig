import * as anchor from '@project-serum/anchor';
import assert from 'assert';
import { PublicKey, Keypair, Transaction, AccountMeta } from '@solana/web3.js';
import { Program } from '@project-serum/anchor';
import { SleagueMutilsig } from '../target/types/sleague_mutilsig';

describe('002-set-league', () => {

  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.Provider.env());

  const threshold = 2;
  const newThreshold = 3;
  const program = anchor.workspace.SleagueMutilsig as Program<SleagueMutilsig>;
  const members = [Keypair.generate(), Keypair.generate(), Keypair.generate()];
  const leagueKey = Keypair.generate();
  const txKey = Keypair.generate();

  it('Create league!', async () => {
    const [leagueSigner, bump] = await anchor.web3.PublicKey.findProgramAddress([Buffer.from("league_signer"), leagueKey.publicKey.toBuffer()], program.programId);
    await program.rpc.createLeague(members.map((m) => m.publicKey), new anchor.BN(threshold), bump, {
      accounts: {
        league: leagueKey.publicKey,
        leagueSigner,
        payer: program.provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId
      },
      signers:[leagueKey]
    });

  });

  it('Create transaction!', async () => {
    
    const leagueSigner = (await anchor.web3.PublicKey.findProgramAddress([Buffer.from("league_signer"), leagueKey.publicKey.toBuffer()], program.programId))[0];

    const ix = program.instruction.setLeague(members.map((m) => m.publicKey), new anchor.BN(newThreshold), {
      accounts: {
        league: leagueKey.publicKey,
        leagueSigner
      }
    });

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
    const leagueAccount = await program.account.league.fetch(leagueKey.publicKey);

    assert.ok(JSON.stringify(txAccount.state) === JSON.stringify({execed:{}}));
    assert.ok(leagueAccount.threshold.eqn(newThreshold));


  });
});