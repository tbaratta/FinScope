"""Orchestrator for running financial analysis pipeline."""
from agents.data_collector import DataCollector
from datetime import datetime
import uuid
from typing import Dict, List, Union

def _extract_symbols(portfolio: Union[Dict[str, List[float]], List[str], None]) -> List[str]:
    """Extract a list of symbols from multiple accepted input shapes.

    Accepts:
    - dict: { "AAPL": [...], "MSFT": [...] }
    - list: ["AAPL", "MSFT"]
    - None: defaults to ["SPY"]
    """
    if portfolio is None:
        return ["SPY"]
    if isinstance(portfolio, dict):
        return list(portfolio.keys())
    if isinstance(portfolio, list):
        return [str(s).upper() for s in portfolio if isinstance(s, str) and s.strip()]
    return ["SPY"]

def generate_report(user_portfolio: Union[Dict[str, List[float]], List[str], None]):
    """Generate a financial analysis report.
    
    Args:
        user_portfolio: Either a dict mapping symbol->price series, a list of symbols, or None.
        
    Returns:
        dict: Report containing market data samples and metadata.
    """
    symbols = _extract_symbols(user_portfolio)
    data_agent = DataCollector()
    market_data = data_agent.run(symbols=symbols)

    report = {
        "run_id": str(uuid.uuid4()),
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "input_symbols": symbols,
        "market_data_keys": list(market_data.keys()),
        "market_data_samples": {k: (v[:5] if isinstance(v, list) else v) for k, v in market_data.items()},
        "warnings": [],
    }
    return report

if __name__ == "__main__":
    test_portfolio = {"SPY": [440, 442, 445, 448, 450, 452]}
    import json
    print(json.dumps(generate_report(test_portfolio), indent=2))
