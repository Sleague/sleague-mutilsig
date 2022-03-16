use std::vec;

use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::Instruction;
use anchor_lang::solana_program;
declare_id!("AHE3asxFy6AREZxDMz88PcGTpX2776Yry8Xp3WPMsiFN");

#[program]
pub mod sleague_mutilsig {
    use super::*;

    pub fn create_league(ctx: Context<CreateLeague>, members: Vec<Pubkey>, threshold: u64, bump: u8) -> ProgramResult {
        let league = &mut ctx.accounts.league;

        let count = members.len();

        // Check for members count
        require!(count > 0, ErrorCode::NoMember);
        require!(count as u64 >= threshold, ErrorCode::InvalidThreshold);

        // Check for duplicate members
        for i in 0..(count - 1) {
            if members[i + 1..].contains(&members[i]) {
                return Err(ErrorCode::DuplicateMembers.into());
            }
        }

        league.members = members;
        league.threshold = threshold;
        league.bump = bump;
        Ok(())
    }

    pub fn create_transaction(ctx: Context<CreateTransaction>, program: Pubkey, account_metainfos: Vec<AccountMetaInfo>, data: Vec<u8>, end_time: u64) -> ProgramResult {
        let league = &ctx.accounts.league;
        let tx = &mut ctx.accounts.transaction;
        let member = &ctx.accounts.member;
        let time_stamp = Clock::get()?.unix_timestamp as u64;
        
        // Check for endding time
        require!(time_stamp <= end_time || end_time == 0, ErrorCode::InvalidEndTime);

        require!(league.members.contains(&member.key()), ErrorCode::InvalidMember);

        tx.league = league.key();
        tx.program = program;
        tx.accounts = account_metainfos;
        tx.data = data;

        tx.approval = league.members.iter()
            .map(|m| if member.key().eq(m) { Some(true) } else { None })
            .collect();

        tx.start_time = time_stamp;
        tx.end_time = end_time;
        tx.state = State::None;
        Ok(())

    }

    pub fn approve_transaction(ctx: Context<ApproveTransaction>, approval: bool) -> ProgramResult {
        let league = &ctx.accounts.league;
        let tx = &mut ctx.accounts.transaction;
        let member = &ctx.accounts.member;
        let time_stamp = Clock::get()?.unix_timestamp as u64;

        // Check for endding time
        require!(time_stamp <= tx.end_time || tx.end_time == 0, ErrorCode::TransactionHasFinished);

        // Check the transaction state
        require!(matches!(tx.state, State::None), ErrorCode::TransactionDetermined);

        let pos = league.members.iter().position(|&x| x == member.key()).ok_or(ErrorCode::InvalidMember)?;

        // Check the transaction approval
        require!(matches!(tx.approval[pos], Option::None), ErrorCode::TransactionHasBeenChecked);

        tx.approval[pos] = Some(approval);

        let agree_count = tx.approval.iter().filter(|x| x.unwrap_or(false)).count() as u64;
        let disagree_count = tx.approval.iter().filter(|x| !x.unwrap_or(true)).count() as u64;

        if agree_count >= league.threshold {
            // exec transaction
            tx.state = State::Accepted;
        }

        if disagree_count >= (league.members.len() as u64).checked_sub(league.threshold).unwrap() {
            // disable transaction
            tx.state = State::Rejected;
        }
        
        Ok(())
    }

    pub fn exec_transaction(ctx: Context<ExecTransaction>) -> ProgramResult {
        let league = &ctx.accounts.league;
        let tx = &mut ctx.accounts.transaction;
        let league_key = league.key();

        require!(matches!(tx.state, State::Accepted), ErrorCode::TransactionHasNotAccepted);

        tx.state = State::Execed;

        let ix = Instruction {
            program_id: tx.program,
            accounts: tx.accounts.iter()
                        .map(|x| AccountMeta { pubkey: x.pubkey, is_signer: x.is_signer, is_writable: x.is_writable}).collect(),
            data: tx.data.clone(),
        };

        let seeds = &[b"league_signer".as_ref(), league_key.as_ref(), &[league.bump]];
        let signer = &[&seeds[..]];
        let accounts = ctx.remaining_accounts;

        solana_program::program::invoke_signed(&ix, accounts, signer)?;

        Ok(())
    }

    pub fn set_league(ctx: Context<SetLeague>, members: Vec<Pubkey>, threshold: u64) -> ProgramResult {
        let league = &mut ctx.accounts.league;
        
        league.members = members;
        league.threshold = threshold;

        Ok(())
    }

}

#[account]
#[derive(Default)]
pub struct League {
    pub members: Vec<Pubkey>,
    pub threshold: u64,
    pub bump: u8,
}

impl League {
    fn base_size() -> usize {
        League::default().try_to_vec().unwrap().len() + 8
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub enum State {
    None,
    Accepted,
    Execed,
    Rejected
}

impl Default for State {
    fn default() -> Self {
        State::None
    }
}

#[derive(Default,AnchorSerialize, AnchorDeserialize, Clone)]
pub struct AccountMetaInfo {
    pub pubkey: Pubkey,
    pub is_signer: bool,
    pub is_writable: bool,
}

impl AccountMetaInfo {
    fn size() -> usize {
        AccountMetaInfo::default().try_to_vec().unwrap().len()
    }
}

#[account]
#[derive(Default)]
pub struct Transaction {
    pub league: Pubkey,
    pub program: Pubkey,
    pub accounts: Vec<AccountMetaInfo>,
    pub data: Vec<u8>,
    pub approval: Vec<Option<bool>>,
    pub start_time: u64,
    pub end_time: u64,
    pub state: State
}

impl Transaction {
    fn base_size() -> usize {
        Transaction::default().try_to_vec().unwrap().len() + 8
    }
}

#[derive(Accounts)]
#[instruction(members: Vec<Pubkey>, threshold: u64, bump: u8)]
pub struct CreateLeague<'info> {
    #[account(init, payer = payer, space = League::base_size() + members.len() * 32)]
    league: Box<Account<'info, League>>,

    #[account(
        seeds = [
            b"league_signer".as_ref(), 
            league.to_account_info().key.as_ref()
        ], 
        bump = bump
    )]
    league_signer: AccountInfo<'info>,
    
    payer: Signer<'info>,
    system_program: Program<'info, System>,
}


#[derive(Accounts)]
#[instruction(program: Pubkey, account_metainfos: Vec<AccountMetaInfo>, data: Vec<u8>, end_time: u64)]
pub struct CreateTransaction<'info> {
    league: Box<Account<'info, League>>,
    #[account(init, payer = payer, space = Transaction::base_size() + AccountMetaInfo::size() * account_metainfos.len() + data.len() + league.members.len() * 2)]
    transaction: Box<Account<'info, Transaction>>,

    member: Signer<'info>,
    payer: Signer<'info>,
    system_program: Program<'info, System>,
    
}


#[derive(Accounts)]
pub struct ApproveTransaction<'info> {
    league: Box<Account<'info, League>>,
    #[account(mut, has_one = league)]
    transaction: Box<Account<'info, Transaction>>,
    member: Signer<'info>,
}



#[derive(Accounts)]
pub struct ExecTransaction<'info> {
    league: Box<Account<'info, League>>,

    #[account(
        mut, 
        has_one = league,
    )]
    transaction: Box<Account<'info, Transaction>>,
}

#[derive(Accounts)]
pub struct SetLeague<'info> {
    #[account(mut)]
    league: Box<Account<'info, League>>,

    #[account(
        seeds = [
            b"league_signer".as_ref(), 
            league.key().as_ref()
        ], 
        bump = league.bump
    )]
    league_signer: Signer<'info>,
}

#[error]
pub enum ErrorCode {
    #[msg("No member")]
    NoMember,
    #[msg("Invalid threshold")]
    InvalidThreshold,
    #[msg("Duplicate members")]
    DuplicateMembers,
    #[msg("Invalid member try to create transaction")]
    InvalidMember,
    #[msg("Invalid end time")]
    InvalidEndTime,
    #[msg("Transaction has finished")]
    TransactionHasFinished,
    #[msg("Transaction state has been determined")]
    TransactionDetermined,
    #[msg("You have already checked for this transaction")]
    TransactionHasBeenChecked,
    #[msg("Transaction has not accepted")]
    TransactionHasNotAccepted,
}