FROM python:3.12-slim

WORKDIR /app
RUN pip install --no-cache-dir uv

# Copy source first so editable install can locate the people_mcp package.
COPY pyproject.toml ./
COPY people_mcp ./people_mcp
COPY config ./config
COPY data ./data

RUN uv pip install --system -e .

EXPOSE 8000
CMD ["python", "-m", "people_mcp.server"]
