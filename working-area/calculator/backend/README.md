# Calculator API (FastAPI backend)

Safe arithmetic expression evaluator built with FastAPI. No `eval` — expressions
are parsed into an AST and only a whitelist of nodes/functions is allowed.

## Endpoints

| Method | Path               | Description                                    |
| ------ | ------------------ | ---------------------------------------------- |
| GET    | `/health`          | Liveness check                                 |
| GET    | `/api/operations`  | Supported operators and math functions         |
| POST   | `/api/calculate`   | Evaluate an expression (JSON body or query)    |
| GET    | `/api/history`     | Recent calculations, newest first              |
| DELETE | `/api/history`     | Clear calculation history                      |

Interactive docs (Swagger UI): http://localhost:8000/docs

## Setup

```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

## Run

```bash
uvicorn app.main:app --reload --port 8000
```

## Example

```bash
curl -X POST http://localhost:8000/api/calculate \
  -H "Content-Type: application/json" \
  -d '{"expression": "sqrt(2) + 3 * (4 - 1)"}'
```

```json
{
  "expression": "sqrt(2) + 3 * (4 - 1)",
  "result": 10.414213562373095,
  "computed_at": "2026-08-09T07:30:00Z"
}
```

## Tests

```bash
cd backend
pytest -q
```

## Supported expression syntax

- Operators: `+`, `-`, `*`, `/`, `//`, `%`, `**`, unary `+`/`-`
- Parentheses and normal operator precedence
- Functions: `abs`, `ceil`, `cos`, `exp`, `floor`, `log`, `log10`, `pow`,
  `round`, `sin`, `sqrt`, `tan`

Anything else (imports, attribute access, arbitrary names, sequences, etc.)
is rejected with HTTP 400.

## Configuration (environment variables)

| Variable            | Default                          | Description                |
| ------------------- | -------------------------------- | -------------------------- |
| `CORS_ORIGINS`      | localhost:8000, :5500, 127.0.0.1 | Comma-separated origins    |
| `CALC_HISTORY_LIMIT`| 100                              | Max stored history entries |
