# JustCode: Developer Agent Workspace

JustCode is an enterprise-grade, multi-LLM developer agent workspace. It orchestrates complex multi-agent development cycles, Model Context Protocol (MCP) servers, custom sandboxed JavaScript skills, and real-time execution graphs within a premium, responsive glassmorphic console.

---

## ✨ Features

### 1. Multi-LLM Orchestration & Session Overrides
- Toggle LLM profiles per session (e.g. Gemini, OpenAI, Anthropic Claude, Codex) dynamically.
- Run comparative code quality tests and performance analysis side-by-side.

### 2. Subscription Bearer Token Authentication
- Skip standard API Keys by enabling **Direct Bearer Authentication**.
- Authenticate session or workspace calls via existing Claude or Codex subscriptions.

### 3. ITIL-Compliant Service Management & Specialized Agents
Features a 10-agent orchestration suite representing the full SDLC and ITIL lifecycle:
- **Architect**: Designs layout plans and coordinates features.
- **Coder**: Implements source code logic.
- **Tester**: Validates logic and runs code test suites.
- **Reviewer**: Gates PR approvals and reviews quality.
- **Incident Manager**: Triages errors, log reports, and crashes.
- **Problem Manager (RCA)**: Performs long-term root-cause regression analysis.
- **Change Manager**: Gates main merges.
- **RCA Analyst**: Dedicated root cause investigator for regressions.
- **Enhancement Specialist**: Dedicated feature developer.
- **Bugfix Specialist**: Dedicated bug repair engineer.

### 4. Git Commit Auditing & Root Cause Telemetry
- Every file change committed through the `git_commit` skill automatically serializes the active agent configuration, prompt history, and instruction overrides into a JSON audit trail under `.justcode/audit/`.
- Enables full telemetry mapping for issue resolution and regression analysis.

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v18+ recommended)
- [npm](https://www.npmjs.com/)

### Installation
Clone the repository and install dependencies:
```bash
git clone https://github.com/romantony/justcode.git
cd justcode
npm install
npm run install-all
```

### Running Locally
To launch both the Backend server and the Frontend Vite client concurrently:
```bash
npm start
```
- **Backend API**: `http://localhost:5001`
- **Frontend App**: `http://localhost:5173`

---

## 🛠️ Configuration & Settings

Navigate to the **LLM & MCP Settings** tab to configure:
1. **API Keys & Custom URLs**: Set API keys or custom proxy endpoints for Gemini, OpenAI, Claude, Codex, or local Ollama instances.
2. **Subscription Toggles**: Tick the "Use Subscription Bearer Token" checkbox to authenticate via Bearer header configurations instead of standard keys.
3. **MCP Servers**: Add/remove stdio-based Server configurations.
