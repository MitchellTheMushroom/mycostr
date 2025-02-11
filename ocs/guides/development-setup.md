Development Setup Guide
Environment Requirements
Basic Requirements

Node.js v16 or higher
Git
Python 3.8+ (for some dependencies)
Docker (recommended)

Lightning Requirements

LND or c-lightning installation
Bitcoin node (testnet/regtest)
Minimum 1M sats for testing

Storage Requirements

Minimum 10GB free space for testing
SSD recommended for development
Regular backup system

Setup Instructions
1. Basic Setup
Clone the repository:
git clone https://github.com/mycostr/mycostr
cd mycostr
Install dependencies:
npm install
Copy example configuration:
cp config.example.json config.json
2. Development Environment
Local Development
Start local test network:
npm run dev-network
Initialize test nodes:
npm run init-test-nodes
Start development server:
npm run dev
Testing Environment
Run test suite:
npm test
Run specific tests:
npm test -- --grep "storage"
Configuration Guide
Core Configuration

Storage paths
Network ports
Test parameters
Debug settings

Lightning Configuration

Node connection
Channel settings
Payment parameters
Network selection

Testing Configuration

Test network settings
Mock data configuration
Performance parameters
Debug options

Development Workflow
Code Style

TypeScript for all new code
ES6+ standards
Async/await pattern
Strong typing

Testing Requirements

Unit tests required
Integration tests for features
Performance testing
Security testing

Git Workflow

Feature branches from main
Pull request required
Tests must pass
Code review required

Documentation

Update docs with changes
Include test coverage
Add inline comments
Update README if needed

Troubleshooting
Common Issues

Port conflicts: Check running services
Dependencies: Clear node_modules and reinstall
Test failures: Check logs in /tmp/test-logs
Network issues: Verify Lightning node connection

Debug Tools

Debug logging enabled with DEBUG=mycostr:*
Network monitoring tools included
Test coverage reports
Performance profiling tools

Next Steps

Review codebase
Run test suite
Try sample implementation
Join development discussion
