# Google Maps API Setup Guide

## Issue: "Address not available"

The error message indicates that the Google Maps Geocoding API is not properly configured. Follow these steps to fix it:

---

## Step 1: Enable Google Maps Geocoding API

### Option A: Use Google Cloud Console (Recommended)

1. **Go to Google Cloud Console**
   - Visit: https://console.cloud.google.com/

2. **Select or Create a Project**
   - Click on the project dropdown at the top
   - Select your existing project or create a new one

3. **Enable Geocoding API**
   - Go to: https://console.cloud.google.com/apis/library
   - Search for "Geocoding API"
   - Click on "Geocoding API"
   - Click "ENABLE" button

4. **Create API Key (if you don't have one)**
   - Go to: https://console.cloud.google.com/apis/credentials
   - Click "CREATE CREDENTIALS" → "API Key"
   - Copy the API key

5. **Configure API Key Restrictions (Important for Security)**
   - Click on your API key to edit
   - Under "Application restrictions":
     - Select "HTTP referrers (web sites)"
     - Add your domain (e.g., `localhost:8100/*` for development)
   - Under "API restrictions":
     - Select "Restrict key"
     - Check "Geocoding API"
   - Click "SAVE"

---

## Step 2: Update Environment Files

Replace the current API key in both environment files:

### Development Environment
**File:** `src/environments/environment.ts`

```typescript
export const environment = {
  production: false,
  firebase: {
    apiKey: 'AIzaSyAKE5W0sDAmGwgzNfIwivvcE2f3_2vDnvo',
    authDomain: 'handy-home-b5d81.firebaseapp.com',
    projectId: 'handy-home-b5d81',
    storageBucket: 'handy-home-b5d81.firebasestorage.app',
    messagingSenderId: '991938859943',
    appId: '1:991938859943:web:8b632c38e2dd7ae8229c82',
    measurementId: 'G-F6KZY247CD',
  },
  googleMapsApiKey: 'YOUR_NEW_API_KEY_HERE', // Replace with your Geocoding API key
};
```

### Production Environment
**File:** `src/environments/environment.prod.ts`

```typescript
export const environment = {
  production: true,
  firebase: {
    apiKey: 'AIzaSyAKE5W0sDAmGwgzNfIwivvcE2f3_2vDnvo',
    authDomain: 'handy-home-b5d81.firebaseapp.com',
    projectId: 'handy-home-b5d81',
    storageBucket: 'handy-home-b5d81.firebasestorage.app',
    messagingSenderId: '991938859943',
    appId: '1:991938859943:web:8b632c38e2dd7ae8229c82',
    measurementId: 'G-F6KZY247CD',
  },
  googleMapsApiKey: 'YOUR_NEW_API_KEY_HERE', // Replace with your Geocoding API key
};
```

---

## Step 3: Verify API Key

### Test the API Key Manually

Open this URL in your browser (replace with your coordinates and API key):
```
https://maps.googleapis.com/maps/api/geocode/json?latlng=13.7854976,121.0712064&key=YOUR_API_KEY
```

**Expected Response (Success):**
```json
{
  "results": [
    {
      "formatted_address": "Batangas City, Batangas, Philippines",
      "address_components": [...],
      ...
    }
  ],
  "status": "OK"
}
```

**Error Responses:**

1. **REQUEST_DENIED**
   ```json
   {
     "error_message": "This API project is not authorized to use this API.",
     "status": "REQUEST_DENIED"
   }
   ```
   **Solution:** Enable Geocoding API in Google Cloud Console

2. **OVER_QUERY_LIMIT**
   ```json
   {
     "error_message": "You have exceeded your daily request quota for this API.",
     "status": "OVER_QUERY_LIMIT"
   }
   ```
   **Solution:** Increase quota or wait for reset

3. **INVALID_REQUEST**
   ```json
   {
     "error_message": "Invalid request.",
     "status": "INVALID_REQUEST"
   }
   ```
   **Solution:** Check coordinates format

---

## Step 4: Check Browser Console

After updating the API key, check the browser console for detailed error messages:

1. Open browser DevTools (F12)
2. Go to Console tab
3. Look for these messages:
   - ✅ `Google Maps API Response: { status: "OK", ... }`
   - ❌ `Google Maps API Error - Status: REQUEST_DENIED`
   - ❌ `API access denied - Check API key`

---

## Alternative Solution: Use Firebase API Key

If you want to use the same Firebase API key for Google Maps:

1. **Enable Geocoding API for Firebase Project**
   - Go to: https://console.cloud.google.com/
   - Select your Firebase project: `handy-home-b5d81`
   - Enable "Geocoding API"

2. **Keep Current Configuration**
   - The current setup uses Firebase API key: `AIzaSyAKE5W0sDAmGwgzNfIwivvcE2f3_2vDnvo`
   - Just enable Geocoding API for this key

---

## Troubleshooting Common Issues

### Issue 1: CORS Error
**Error:** `Access to fetch at 'https://maps.googleapis.com/...' has been blocked by CORS policy`

**Solution:**
- This shouldn't happen with Geocoding API (it supports CORS)
- If it does, check API key restrictions
- Make sure you're not using a server-side only API key

### Issue 2: API Key Restrictions
**Error:** `REQUEST_DENIED` with message about referrer

**Solution:**
- Go to Google Cloud Console → Credentials
- Edit your API key
- Under "Application restrictions", add:
  - `localhost:8100/*` (for Ionic development)
  - `localhost:4200/*` (for Angular development)
  - Your production domain

### Issue 3: Billing Not Enabled
**Error:** `This API project is not authorized to use this API`

**Solution:**
- Google Maps APIs require billing to be enabled
- Go to: https://console.cloud.google.com/billing
- Enable billing for your project
- Google provides $200 free credit per month

### Issue 4: Wrong Coordinates
**Error:** `ZERO_RESULTS`

**Solution:**
- Verify coordinates are valid
- Check format: latitude,longitude (e.g., 13.7854976,121.0712064)
- Ensure coordinates are not (0, 0)

---

## API Pricing (Important)

### Geocoding API Pricing
- **$5.00 per 1,000 requests**
- **$200 free credit per month** (covers 40,000 requests)
- **SKU:** Geocoding

### Cost Optimization Tips
1. **Cache results** - Store addresses locally
2. **Limit requests** - Only fetch when location changes significantly
3. **Set quotas** - Prevent unexpected charges
4. **Monitor usage** - Check Google Cloud Console regularly

---

## Testing Checklist

After setup, verify:

- [ ] Geocoding API is enabled in Google Cloud Console
- [ ] API key is correctly set in environment files
- [ ] API key has proper restrictions configured
- [ ] Billing is enabled (if required)
- [ ] Test URL returns `"status": "OK"`
- [ ] Browser console shows successful API response
- [ ] Address displays correctly in the app

---

## Quick Fix Commands

### Restart Development Server
```bash
# Stop the server (Ctrl+C)
# Clear cache and restart
ionic serve --no-open
```

### Check Environment Variables
```bash
# View current environment
cat src/environments/environment.ts
```

---

## Support Resources

- **Google Maps Platform Documentation:** https://developers.google.com/maps/documentation/geocoding
- **API Key Best Practices:** https://developers.google.com/maps/api-security-best-practices
- **Pricing Calculator:** https://mapsplatform.google.com/pricing/
- **Support:** https://developers.google.com/maps/support

---

## Summary

The "Address not available" error is most likely caused by:

1. ❌ **Geocoding API not enabled** (Most common)
2. ❌ **Invalid or restricted API key**
3. ❌ **Billing not enabled**
4. ❌ **API key restrictions blocking requests**

**Quick Fix:**
1. Go to https://console.cloud.google.com/apis/library
2. Search "Geocoding API"
3. Click "ENABLE"
4. Wait 1-2 minutes
5. Refresh your app

After enabling the API, the address should display correctly!
