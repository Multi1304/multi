# Acceptable Use Policy (AUP) and Internal Terms

This document establishes the boundaries for legitimate usage of the Multilogin Platform and outlines prohibited behaviors and enforcement strategies. User consent to this policy is mandated during tenant registration.

## 1. Legitimate Use Cases

The Multilogin platform is intended to be used for authorized business automation workflows and privacy management. Expected uses include:
- Social media management for legally owned brand accounts.
- SEO monitoring and competitive analysis tracking.
- Web scraping of public data strictly adhering to target website terms.
- Managing geographically segmented ad campaigns.

## 2. Prohibition of Abuse

Users are strictly forbidden from utilizing platform infrastructure (Servers, Worker nodes, Proxy rotation, Fingerprinting) to conduct any of the following:

- **Distributed Denial of Service (DDoS)**: Orchestrated floods against targets using task batching and large-scale bulk profiles.
- **Fraud & Financial Exploitation**: Creating accounts to bypass anti-fraud checks for illicit purchases, money laundering, or credit card testing.
- **Spam & Phishing**: Mass distribution of unsolicited material, or deploying deceptive profiles to compromise credentials.
- **Terms of Service Evasion**: Circumventing platform bans maliciously to harass individuals or distribute malware.

## 3. Quotas and Limits

To prevent incidental or intentional "noisy neighbor" impacts on shared infrastructure, the following operational ceilings are strictly enforced per billing plan:
- Maximum active simultaneous login sessions per user: 3
- Maximum Bulk Profile operations per day.
- Maximum Task Automation batches per day.

## 4. Suspension Policy & Enforcement

Platform Abuse Teams and automated heuristics monitor anomalies based on the limits structured above. 
- If a tenant is flagged for violating the AUP, the workspace will be subject to immediate `Suspension` without refund.
- A Superadmin will review the `Audit Log` spanning the account's history. 
- If found guilty, all data associated with the tenant will be permanently purged following a 14-day hold period. 
- Users are required to formally click "I agree" natively on the `Registration` interface, permanently binding their account creation (`termsAcceptedAt`) to these protocols.
