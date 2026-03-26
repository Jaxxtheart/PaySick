# Requirements & Specifications — PaySick v1.4.4

**Version**: 1.4.4
**Date**: 2026-03-26

Carries forward all requirements from v1.4.3 with the following addition.

---

## Changed / Added Requirements

### 2.9 Frontend Error Handling

| ID | Requirement | Priority |
|----|-------------|----------|
| FE-01 | `register.html` `response.json()` must be wrapped in try/catch — non-JSON server responses must show a friendly status-code message, never a raw SyntaxError | Must Have — added v1.3.1 |
| FE-02 | `login.html` `response.json()` must be wrapped in try/catch — non-JSON server responses must show "Server error (N). Please try again shortly." | Must Have — fixed v1.4.4 |
| FE-03 | No page may display a raw JavaScript error message (SyntaxError, TypeError, etc.) to end users | Must Have — fixed v1.4.4 |

### 2.10 Test Coverage

| ID | Requirement | Priority |
|----|-------------|----------|
| TEST-01 | Unit test suite must include regression tests for non-JSON login response handling | Must Have — added v1.4.4 |
| TEST-02 | Total unit tests must be ≥ 67 | Must Have — added v1.4.4 |
