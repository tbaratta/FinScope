# FinScope Agents

Python package containing analysis and reporting agents for FinScope.

## Structure

- `__init__.py` - Package initialization
- `data_collector.py` - Market data collection agent using yfinance
- `orchestrator.py` - Pipeline orchestration and report generation

## Usage

```python
from agents.orchestrator import generate_report

# Generate a report for a portfolio
portfolio = {"SPY": [440, 445, 450]}
report = generate_report(portfolio)
```

## Development

To add new agents:
1. Create a new agent file in this directory
2. Add the agent class with a `run()` method
3. Update orchestrator.py to use the new agent

## Testing

Run tests from the backend/python directory:
```bash
pytest tests/agents/
```