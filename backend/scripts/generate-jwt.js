#!/usr/bin/env node

/**
 * Script to generate a JWT token for testing purposes
 * 
 * Usage: node generate-jwt.js <user-id> <email> <expiry>
 * 
 * Example: node generate-jwt.js dev-user dev@example.com 7d
 * 
 * This will generate a JWT token that expires in 7 days
 * 
 * Defaults: 
 * - user-id: dev-user
 * - email: dev@example.com
 * - expiry: 7d
 * 
 * Uses .env file to get the JWT_SECRET
 */
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');

// Load .env file
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach((line) => {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length) {
      process.env[key.trim()] = valueParts.join('=').trim();
    }
  });
}

const secret = process.env.JWT_SECRET;
if (!secret) {
  console.error('Error: JWT_SECRET not found in .env file');
  process.exit(1);
}

// Parse arguments
const args = process.argv.slice(2);
const userId = args[0] || 'dev-user';
const email = args[1] || 'dev@example.com';
const expiry = args[2] || '7d';

const token = jwt.sign({ sub: userId, email }, secret, { expiresIn: expiry });

console.log('\n🔐 JWT Token Generated\n');
console.log('User ID:', userId);
console.log('Email:', email);
console.log('Expires in:', expiry);
console.log('\nToken:\n');
console.log(token);
console.log('\nUsage:\n');
console.log(`curl http://localhost:3000/account -H "Authorization: Bearer ${token}"\n`);

