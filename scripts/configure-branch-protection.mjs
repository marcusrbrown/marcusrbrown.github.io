#!/usr/bin/env node
/**
 * Branch Protection Configuration Script
 *
 * This script helps configure GitHub branch protection rules for the mrbro.dev repository.
 * It ensures all test suites are properly integrated as required status checks.
 */

import {execSync} from 'node:child_process'
import process from 'node:process'

// Configuration for branch protection
const BRANCH_PROTECTION_CONFIG = {
  // Primary branch to protect
  branch: 'main',

  // Repository information
  owner: 'marcusrbrown',
  repo: 'marcusrbrown.github.io',

  // Required status checks (choose one approach)
  statusChecks: {
    // Option 1: Unified status check (recommended)
    unified: ['tests/comprehensive'],

    // Option 2: Individual status checks (granular control)
    individual: [
      'Quality Gate', // CI workflow
      'Test Summary & Badge Generation', // E2E workflow
      'Performance Audit', // Performance workflow
    ],
  },

  // Branch protection settings
  protection: {
    required_status_checks: {
      strict: true, // Require branches to be up to date before merging
      contexts: [], // Will be set based on chosen strategy
    },
    enforce_admins: false, // Allow admins to bypass restrictions for emergency fixes
    required_pull_request_reviews: {
      required_approving_review_count: 1,
      dismiss_stale_reviews: true,
      require_code_owner_reviews: true,
      restrict_review_dismissals: false,
    },
    restrictions: null, // No push restrictions
    allow_force_pushes: false,
    allow_deletions: false,
    block_creations: false,
  },
}

/**
 * Check if GitHub CLI is installed and authenticated
 */
function checkGitHubCLI() {
  try {
    execSync('gh --version', {stdio: 'pipe'})
    console.log('✅ GitHub CLI is installed')

    // Check authentication
    const authStatus = execSync('gh auth status', {stdio: 'pipe'}).toString()
    if (authStatus.includes('Logged in')) {
      console.log('✅ GitHub CLI is authenticated')
      return true
    } else {
      console.error('❌ GitHub CLI is not authenticated. Run: gh auth login')
      return false
    }
  } catch {
    console.error('❌ GitHub CLI is not installed. Install from: https://cli.github.com/')
    return false
  }
}

/**
 * Get current branch protection settings
 */
function getCurrentProtection() {
  try {
    const cmd = `gh api repos/${BRANCH_PROTECTION_CONFIG.owner}/${BRANCH_PROTECTION_CONFIG.repo}/branches/${BRANCH_PROTECTION_CONFIG.branch}/protection`
    const result = execSync(cmd, {stdio: 'pipe'}).toString()
    return JSON.parse(result)
  } catch {
    console.log('ℹ️  No existing branch protection found')
    return null
  }
}

/**
 * Configure branch protection with unified status check
 */
function configureUnifiedProtection() {
  console.log('🔧 Configuring unified status check protection...')

  const config = {...BRANCH_PROTECTION_CONFIG.protection}
  config.required_status_checks.contexts = BRANCH_PROTECTION_CONFIG.statusChecks.unified

  try {
    const cmd = `gh api repos/${BRANCH_PROTECTION_CONFIG.owner}/${BRANCH_PROTECTION_CONFIG.repo}/branches/${BRANCH_PROTECTION_CONFIG.branch}/protection --method PUT --input -`
    execSync(cmd, {
      input: JSON.stringify(config),
      stdio: ['pipe', 'inherit', 'inherit'],
    })
    console.log('✅ Unified branch protection configured successfully')
  } catch (error) {
    console.error('❌ Failed to configure branch protection:', error.message)
    throw error
  }
}

/**
 * Configure branch protection with individual status checks
 */
function configureIndividualProtection() {
  console.log('🔧 Configuring individual status check protection...')

  const config = {...BRANCH_PROTECTION_CONFIG.protection}
  config.required_status_checks.contexts = BRANCH_PROTECTION_CONFIG.statusChecks.individual

  try {
    const cmd = `gh api repos/${BRANCH_PROTECTION_CONFIG.owner}/${BRANCH_PROTECTION_CONFIG.repo}/branches/${BRANCH_PROTECTION_CONFIG.branch}/protection --method PUT --input -`
    execSync(cmd, {
      input: JSON.stringify(config),
      stdio: ['pipe', 'inherit', 'inherit'],
    })
    console.log('✅ Individual branch protection configured successfully')
  } catch (error) {
    console.error('❌ Failed to configure branch protection:', error.message)
    throw error
  }
}

/**
 * Display current protection status
 */
function displayProtectionStatus(protection) {
  if (!protection) {
    console.log('📋 Current Protection Status: None')
    return
  }

  console.log('📋 Current Protection Status:')
  console.log(`   Branch: ${BRANCH_PROTECTION_CONFIG.branch}`)
  console.log(`   Required Reviews: ${protection.required_pull_request_reviews?.required_approving_review_count || 0}`)
  console.log(`   Enforce for Admins: ${protection.enforce_admins}`)
  console.log(`   Required Status Checks: ${protection.required_status_checks?.contexts?.length || 0}`)

  if (protection.required_status_checks?.contexts?.length > 0) {
    console.log('   Status Checks:')
    protection.required_status_checks.contexts.forEach(check => {
      console.log(`   - ${check}`)
    })
  }
}

/**
 * Verify status checks are working
 */
function verifyStatusChecks() {
  console.log('🔍 Verifying status checks...')

  try {
    // Get recent workflow runs
    const cmd = `gh api repos/${BRANCH_PROTECTION_CONFIG.owner}/${BRANCH_PROTECTION_CONFIG.repo}/actions/runs --jq '.workflow_runs[:5] | .[] | {name: .name, status: .status, conclusion: .conclusion}'`
    const result = execSync(cmd, {stdio: 'pipe'}).toString()
    const runs = result
      .split('\n')
      .filter(line => line.trim())
      .map(line => JSON.parse(line))

    console.log('📊 Recent Workflow Runs:')
    runs.forEach(run => {
      const statusIcon = run.conclusion === 'success' ? '✅' : run.conclusion === 'failure' ? '❌' : '⏳'
      console.log(`   ${statusIcon} ${run.name}: ${run.status} (${run.conclusion || 'running'})`)
    })

    return runs
  } catch (error) {
    console.error('⚠️  Could not verify status checks:', error.message)
    return []
  }
}

/**
 * Main execution function
 */
async function main() {
  console.log('🛡️  Branch Protection Configuration Tool')
  console.log('=========================================\n')

  // Check prerequisites
  if (!checkGitHubCLI()) {
    process.exit(1)
  }

  // Get command line arguments
  const args = process.argv.slice(2)
  const command = args[0] || 'status'

  switch (command) {
    case 'status': {
      console.log('📊 Checking current branch protection status...\n')
      const currentProtection = getCurrentProtection()
      displayProtectionStatus(currentProtection)
      verifyStatusChecks()
      break
    }

    case 'configure': {
      const strategy = args[1] || 'unified'

      if (strategy === 'unified') {
        console.log('🎯 Configuring unified status check strategy...\n')
        configureUnifiedProtection()
      } else if (strategy === 'individual') {
        console.log('🎯 Configuring individual status check strategy...\n')
        configureIndividualProtection()
      } else {
        console.error('❌ Invalid strategy. Use "unified" or "individual"')
        process.exit(1)
      }

      // Show final status
      console.log('\n📊 Final protection status:')
      const finalProtection = getCurrentProtection()
      displayProtectionStatus(finalProtection)
      break
    }

    case 'remove':
      console.log('🗑️  Removing branch protection...\n')
      try {
        const cmd = `gh api repos/${BRANCH_PROTECTION_CONFIG.owner}/${BRANCH_PROTECTION_CONFIG.repo}/branches/${BRANCH_PROTECTION_CONFIG.branch}/protection --method DELETE`
        execSync(cmd, {stdio: 'inherit'})
        console.log('✅ Branch protection removed successfully')
      } catch (error) {
        console.error('❌ Failed to remove branch protection:', error.message)
      }
      break

    case 'help':
    default:
      console.log('📖 Usage:')
      console.log('   pnpm run configure:branch-protection [command] [options]')
      console.log('')
      console.log('📋 Commands:')
      console.log('   status                    - Show current protection status')
      console.log('   configure [unified]       - Configure unified status check (recommended)')
      console.log('   configure individual      - Configure individual status checks')
      console.log('   remove                    - Remove branch protection')
      console.log('   help                      - Show this help')
      console.log('')
      console.log('💡 Examples:')
      console.log('   pnpm run configure:branch-protection status')
      console.log('   pnpm run configure:branch-protection configure unified')
      console.log('   pnpm run configure:branch-protection configure individual')
      break
  }

  console.log('\n📚 For more information, see: .github/BRANCH_PROTECTION.md')
}

// Execute main function
main().catch(error => {
  console.error('💥 Error:', error.message)
  process.exit(1)
})
