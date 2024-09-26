# Testing

```json
{
    "persist": false,
    "inputs": [
        {
            "points": {
                "add": true,
                "amount": 1
            }
        }
    ]
}
```

## Test 1
- if: /points/add
- ```ts
  input.points = input.points.amount + 1
  ```