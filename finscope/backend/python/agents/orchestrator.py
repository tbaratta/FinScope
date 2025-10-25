"""Orchestrator for running financial analysis pipeline."""
from agents.data_collector import DataCollector
from datetime import datetime
import uuid

def generate_report(user_portfolio):
    """Generate a financial analysis report.
    
    Args:
        user_portfolio (dict): Symbol -> price list mapping.
        
    Returns:
        dict: Report containing market data samples and metadata.
    """
    data_agent = DataCollector()
    market_data = data_agent.run(symbols=list(user_portfolio.keys()))

    report = {
        "run_id": str(uuid.uuid4()),
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "input_portfolio": user_portfolio,
        "market_data_keys": list(market_data.keys()),
        "market_data_samples": {k: v[:5] for k, v in market_data.items()},
        "warnings": [],
    }
    return report

if __name__ == "__main__":
    test_portfolio = {"SPY": [440, 442, 445, 448, 450, 452]}
    import json
    print(json.dumps(generate_report(test_portfolio), indent=2))
