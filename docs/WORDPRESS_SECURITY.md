# WordPress Integration Security Guide

## Overview

The Radio Show Planner integrates with WordPress sites to publish content. This guide covers the security requirements and best practices for setting up the integration.

## Authentication Requirements

### ✅ Use Application Passwords (Required)

WordPress Application Passwords are **required** for this integration. Normal login passwords are **NOT supported**.

**How to create an Application Password:**
1. Log into WordPress admin as the service account user
2. Go to Users → Profile
3. Scroll to "Application Passwords" section
4. Enter a name (e.g., "Radio Show Planner")
5. Click "Add New Application Password"
6. Copy the generated password (shown only once)

### ❌ Do NOT Use

- Normal WordPress login passwords
- Administrator accounts
- Shared human user accounts

## Service Account Setup

### Create a Dedicated Service Account

Create a WordPress user specifically for the API integration:

1. Go to Users → Add New
2. Set username (e.g., `radio-planner-api`)
3. Use a strong, unique email address
4. Set role to **Author** or create a custom role (see below)
5. Save user and create Application Password

### Minimum Required Capabilities

The service account needs these WordPress capabilities:

| Capability | Required | Purpose |
|------------|----------|---------|
| `edit_posts` | ✅ Yes | Create and edit posts |
| `publish_posts` | ⚠️ Optional | Publish posts directly (if not using draft) |
| `upload_files` | ✅ Yes | Upload featured images |
| `edit_pages` | ⚠️ Optional | If publishing to pages |

### Recommended Role: Author

The built-in **Author** role provides these capabilities without Administrator access.

### Custom Role (Advanced)

For maximum security, create a custom role with only required capabilities:

```php
// Add to theme's functions.php or a custom plugin
add_role('radio_planner_api', 'Radio Planner API', [
    'read' => true,
    'edit_posts' => true,
    'publish_posts' => true,
    'upload_files' => true,
    'edit_published_posts' => true,
]);
```

## Two-Factor Authentication (2FA)

### Human Accounts
- 2FA **should remain enabled** for all human WordPress accounts
- This protects against password compromise

### API Access
- Application Passwords work **independently** of 2FA
- The API service account can authenticate without 2FA prompts
- This is by WordPress design and is secure

## Credential Management

### In the Dashboard

| Feature | Description |
|---------|-------------|
| Credentials never exposed | `app_password` is never returned in API responses |
| Test Connection | Verify credentials work and check capabilities |
| Disable Site | Set `is_active: false` to temporarily disable |
| Delete Site | Permanently removes credentials from database |
| Update Credentials | Change `app_password` for rotation |

### Credential Rotation

To rotate credentials without downtime:
1. In WordPress, create a new Application Password
2. In the dashboard, update the WordPress site with new password
3. Test connection to verify
4. In WordPress, revoke the old Application Password

## Audit & Monitoring

### Logged Events

The integration logs these security events:

- ✅ Successful connection tests
- ⚠️ Failed authentication attempts
- ⚠️ Connection timeouts
- ❌ Connection errors

### Viewing Logs

Logs are written to the standard backend log output. Failed authentication attempts are also stored in the `wordpress_auth_logs` database collection.

## Security Warnings

The "Test Connection" feature checks for security issues:

| Warning | Meaning | Action |
|---------|---------|--------|
| "Connected as Administrator" | Service account has admin role | Create a limited service account |
| "Missing capability: edit_posts" | Cannot create/edit posts | Add capability to user role |
| "Missing capability: upload_files" | Cannot upload featured images | Add capability to user role |

## Checklist

Before connecting a WordPress site:

- [ ] Created dedicated service account (not Administrator)
- [ ] Service account has required capabilities
- [ ] Generated Application Password (not login password)
- [ ] 2FA enabled on all human WordPress accounts
- [ ] Tested connection and reviewed warnings
- [ ] Documented the service account in your team's records

## Non-Goals

This integration does **NOT**:

- ❌ Provide interactive WordPress login from the dashboard
- ❌ Support password-based authentication with human accounts
- ❌ Access WordPress admin functionality beyond content publishing
- ❌ Sync content from WordPress back to the dashboard
