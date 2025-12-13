# Branch Protection Configuration Guide

This guide explains how to configure GitHub branch protection rules to enforce comprehensive testing requirements for the mrbro.dev project.

## Overview

The project uses multiple test suites that should be enforced as required status checks before merging pull requests. This ensures high code quality and prevents regressions.

## Required Status Checks

### Primary Status Checks

These are the main status checks that should be **required** for merge:

1. **`tests/comprehensive`** - Unified status check from the Status Checks workflow
   - Aggregates all other test suite results
   - Provides single source of truth for PR readiness
   - **Recommended**: Use this as the primary required check

### Individual Test Suite Checks (Alternative)

If you prefer granular control, you can require individual workflow jobs:

#### CI Workflow (`CI`)

- **`Quality Gate`** - Consolidates unit tests, linting, build, type checking, validation
- **`Matrix Test`** - Cross-platform compatibility testing

#### E2E Tests Workflow (`E2E Tests`)

- **`Test Summary & Badge Generation`** - Consolidates E2E, visual, accessibility tests
- **`E2E Tests (chromium)`** - Core end-to-end functionality
- **`Visual Regression Tests`** - UI consistency validation

#### Performance Testing Workflow (`Performance Testing`)

- **`Performance Audit`** - Lighthouse performance validation
- **`Performance Summary`** - Aggregated performance metrics

## Configuration Steps

### Method 1: GitHub Web UI (Recommended)

1. **Navigate to Repository Settings**

   ```text
   GitHub.com → Repository → Settings → Branches
   ```

2. **Add/Edit Branch Protection Rule**
   - Branch name pattern: `main`
   - Enable "Restrict pushes that create files"

3. **Configure Required Status Checks**
   - ✅ Require status checks to pass before merging
   - ✅ Require branches to be up to date before merging

   **Required checks to add:**

   ```text
   tests/comprehensive
   ```

   **Optional additional checks:**

   ```text
   Quality Gate
   Test Summary & Badge Generation
   Performance Audit (desktop)
   Performance Audit (mobile)
   ```

4. **Additional Protection Settings**
   - ✅ Require pull request reviews before merging (1 reviewer minimum)
   - ✅ Dismiss stale PR approvals when new commits are pushed
   - ✅ Require review from CODEOWNERS
   - ✅ Restrict who can dismiss pull request reviews
   - ✅ Allow force pushes (disabled)
   - ✅ Allow deletions (disabled)

### Method 2: GitHub CLI Configuration

```bash
# Configure comprehensive branch protection
gh api repos/marcusrbrown/marcusrbrown.github.io/branches/main/protection \
  --method PUT \
  --field required_status_checks='{"strict":true,"contexts":["tests/comprehensive"]}' \
  --field enforce_admins=true \
  --field required_pull_request_reviews='{"required_approving_review_count":1,"dismiss_stale_reviews":true,"require_code_owner_reviews":true}' \
  --field restrictions=null \
  --field allow_force_pushes=false \
  --field allow_deletions=false

# Alternative: More granular status checks
gh api repos/marcusrbrown/marcusrbrown.github.io/branches/main/protection \
  --method PUT \
  --field required_status_checks='{"strict":true,"contexts":["Quality Gate","Test Summary & Badge Generation","Performance Audit"]}' \
  --field enforce_admins=true \
  --field required_pull_request_reviews='{"required_approving_review_count":1,"dismiss_stale_reviews":true,"require_code_owner_reviews":true}' \
  --field restrictions=null \
  --field allow_force_pushes=false \
  --field allow_deletions=false
```

### Method 3: Repository Configuration Script

Use the provided script to configure branch protection programmatically:

```bash
# Run the branch protection configuration script
pnpm run configure:branch-protection
```

## Status Check Behaviors

### Unified Status Check (`tests/comprehensive`)

**Advantages:**

- ✅ Single required check simplifies PR management
- ✅ Provides comprehensive status in one place
- ✅ Automatically aggregates all test results
- ✅ Easier to manage and understand

**Status States:**

- `success` - All test suites passed
- `failure` - One or more test suites failed
- `pending` - Tests are still running

### Individual Status Checks

**Advantages:**

- ✅ Granular visibility into specific failures
- ✅ Can selectively bypass specific test types if needed
- ✅ Better for debugging which specific tests failed

**Considerations:**

- ⚠️ Requires managing multiple required checks
- ⚠️ More complex PR status interface
- ⚠️ Potential for configuration drift

## Testing Configuration

To verify your branch protection configuration:

1. **Create a test PR** with intentional test failures
2. **Verify status checks appear** in the PR interface
3. **Confirm merge is blocked** until all checks pass
4. **Test bypass permissions** (for repository admins)

## Troubleshooting

### Status Check Not Appearing

1. **Verify workflow names** match exactly in branch protection settings
2. **Check workflow triggers** include `pull_request` events
3. **Ensure workflows run** on the target branch
4. **Verify permissions** for status check creation

### Status Check Always Pending

1. **Check workflow execution** in Actions tab
2. **Verify API tokens** have sufficient permissions
3. **Review workflow logs** for errors
4. **Confirm context names** match configuration

### False Positive/Negative Status

1. **Review status check logic** in workflow files
2. **Verify all dependencies** are properly configured
3. **Check workflow conditions** and triggers
4. **Test manually** with workflow_dispatch

## Maintenance

### Regular Tasks

1. **Review status check names** when workflows change
2. **Update required checks** as testing strategy evolves
3. **Monitor workflow performance** and execution times
4. **Validate protection rules** remain effective

### When to Update

- Adding new test suites or workflows
- Changing workflow names or job names
- Modifying testing strategy or requirements
- Repository reorganization or refactoring

## Best Practices

### Configuration

- Use unified status check for simplicity
- Require up-to-date branches before merge
- Enable branch protection for all contributors including admins
- Configure appropriate reviewer requirements

### Workflow Design

- Keep status check jobs lightweight and fast
- Provide clear success/failure messaging
- Include links to detailed test results
- Use consistent naming conventions

### Monitoring

- Regularly review failed status checks
- Monitor workflow execution times
- Track false positive/negative rates
- Gather developer feedback on workflow effectiveness

## Related Documentation

- [GitHub Branch Protection Rules](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/defining-the-mergeability-of-pull-requests/about-protected-branches)
- [GitHub Status Checks API](https://docs.github.com/en/rest/commits/statuses)
- [Testing Documentation](./TESTING.md)
- [CI/CD Workflows](./.github/workflows/)
