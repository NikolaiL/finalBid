# Bot Prevention Setup Guide

## Overview
This implementation adds multi-layered bot prevention to the FinalBid contract:

1. **Human Verification**: reCAPTCHA verification on frontend
2. **Server-Side Signing**: Backend signs access tokens after human verification
3. **Smart Contract Verification**: Contract verifies signatures and timestamps

## Environment Variables

Add these to your `.env.local` file:

```bash
# reCAPTCHA Configuration
NEXT_PUBLIC_RECAPTCHA_SITE_KEY=your_recaptcha_site_key_here
RECAPTCHA_SECRET_KEY=your_recaptcha_secret_key_here

# Server Private Key for signing access tokens
# Generate with: openssl rand -hex 32
SERVER_PRIVATE_KEY=your_server_private_key_here
```

## Setup Steps

### 1. Get reCAPTCHA Keys
1. Go to [Google reCAPTCHA](https://www.google.com/recaptcha/admin)
2. Create a new site with reCAPTCHA v3
3. Add your domain to the site list
4. Copy the Site Key and Secret Key

### 2. Generate Server Private Key
```bash
# Generate a random private key
openssl rand -hex 32
```

### 3. Update reCAPTCHA Site Key in Layout
Update the reCAPTCHA script in `packages/nextjs/app/layout.tsx`:
```html
<script
  src="https://www.google.com/recaptcha/api.js?render=YOUR_SITE_KEY"
  async
  defer
></script>
```

### 4. Deploy Contract
```bash
# Deploy with the new signature verification
yarn deploy
```

## How It Works

### Frontend Flow
1. User clicks "Place Bid"
2. reCAPTCHA verification runs automatically
3. Frontend sends human proof + wallet + auction ID to backend
4. Backend verifies reCAPTCHA and signs access token
5. Frontend calls `placeBid` with access token

### Backend Verification
- Verifies reCAPTCHA token with Google
- Signs message containing: wallet, timestamp, auction ID
- Returns signed access token

### Smart Contract Verification
- Verifies signature came from valid signer
- Checks wallet matches transaction sender
- Ensures timestamp is within 5 minutes
- Validates auction ID matches current auction

## Security Features

✅ **Human Verification**: Prevents bots from getting access tokens
✅ **Time-Limited**: Access tokens expire after 5 minutes
✅ **Cryptographic Security**: Server-signed messages can't be forged
✅ **Auction-Specific**: Each token is tied to a specific auction
✅ **One-Time Use**: Each bid requires a fresh access token

## Production Considerations

1. **Separate Server Key**: Use a dedicated server key for signing (not deployer)
2. **Key Rotation**: Implement key rotation for the server private key
3. **Rate Limiting**: Add rate limiting to the `/api/verify-and-sign` endpoint
4. **Monitoring**: Monitor failed verification attempts
5. **Backup Keys**: Keep backup signing keys in secure storage

## Testing

1. Deploy contract locally: `yarn deploy`
2. Start frontend: `yarn start`
3. Try placing a bid - should go through human verification flow
4. Check browser console for verification steps

## Troubleshooting

- **reCAPTCHA not loading**: Check site key in layout.tsx
- **Signature verification fails**: Verify SERVER_PRIVATE_KEY is set correctly
- **Access token expired**: Tokens expire after 5 minutes, user needs to retry
- **Invalid auction ID**: Make sure auction is active when placing bid
