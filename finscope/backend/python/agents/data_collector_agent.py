# agents/data_collector.py
import yfinance as yf

class DataCollector:
    def run(self, symbols=["SPY", "QQQ", "DIA"]):
        data = {}
        for sym in symbols:
            ticker = yf.Ticker(sym)
            hist = ticker.history(period="1mo", interval="1d")
            data[sym] = hist["Close"].tolist()
        return data
