"""Data collection agent for fetching market data."""
import yfinance as yf

class DataCollector:
    def run(self, symbols=["SPY", "QQQ", "DIA"]):
        """Fetch market data for the given symbols.
        
        Args:
            symbols (list): List of ticker symbols to fetch data for.
            
        Returns:
            dict: Symbol -> list of closing prices mapping.
        """
        data = {}
        for sym in symbols:
            ticker = yf.Ticker(sym)
            hist = ticker.history(period="1mo", interval="1d")
            data[sym] = hist["Close"].tolist()
        return data