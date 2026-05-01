from people_mcp.errors import unknown_value, not_found, ambiguous_match

def test_unknown_value_payload():
    err = unknown_value(field="team", got="Bakery", valid=["Bread", "Marketing"])
    assert err == {
        "error": "unknown_value",
        "field": "team",
        "got": "Bakery",
        "valid": ["Bread", "Marketing"],
    }

def test_not_found_payload():
    err = not_found(entity="person", by="full_name", value="Doesnt Exist")
    assert err["error"] == "not_found"
    assert err["entity"] == "person"

def test_ambiguous_match_payload():
    err = ambiguous_match(entity="person", value="Alistair", candidates=["Alistair Finch", "Alistair Pendergast"])
    assert err["error"] == "ambiguous_match"
    assert len(err["candidates"]) == 2
