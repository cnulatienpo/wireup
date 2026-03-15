#!/usr/bin/env python3
"""Build workflow graph from TouchDesigner operator JSON files and generate recipe libraries."""

from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Set, Tuple

MIN_DEPTH = 2
MAX_DEPTH = 4

FAMILY_COMPATIBILITY = {
    "TOP": {"TOP"},
    "CHOP": {"PARAMETER"},
    "DAT": {"CHOP"},
    "SOP": {"SOP"},
    "MAT": {"MAT"},
}


def slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", value.lower()).strip("_")


@dataclass(frozen=True)
class Operator:
    op_id: str
    operator_name: str
    family: str
    category: str
    parameters: Tuple[str, ...]


def resolve_repo_root() -> Path:
    return Path(__file__).resolve().parents[1]


def resolve_default_paths() -> Tuple[Path, Path]:
    repo_root = resolve_repo_root()
    input_candidate = Path("/knowledge/operators")
    output_candidate = Path("/knowledge/generated")

    if not input_candidate.exists():
        input_candidate = repo_root / "knowledge" / "operators"
    if not output_candidate.exists():
        output_candidate = repo_root / "knowledge" / "generated"

    return input_candidate, output_candidate


def load_operator_files(input_dir: Path) -> Dict[str, Operator]:
    if not input_dir.exists():
        raise FileNotFoundError(f"Input directory not found: {input_dir}")

    operators: Dict[str, Operator] = {}
    for path in sorted(input_dir.glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        operator_name = str(data.get("operator_name") or path.stem)
        family = str(data.get("family", "")).upper().strip()
        category = slugify(str(data.get("category", "general") or "general"))

        parameters_raw = data.get("parameters", [])
        if isinstance(parameters_raw, list):
            parameters = tuple(sorted(str(item) for item in parameters_raw))
        else:
            parameters = tuple()

        op_id = slugify(operator_name)
        if op_id in operators:
            # keep deterministic uniqueness
            suffix = 2
            while f"{op_id}_{suffix}" in operators:
                suffix += 1
            op_id = f"{op_id}_{suffix}"

        operators[op_id] = Operator(
            op_id=op_id,
            operator_name=operator_name,
            family=family,
            category=category,
            parameters=parameters,
        )

    if not operators:
        raise ValueError(f"No operator JSON files found in {input_dir}")

    return operators


def families_compatible(source_family: str, target_family: str) -> bool:
    allowed_targets = FAMILY_COMPATIBILITY.get(source_family, set())
    if target_family in allowed_targets:
        return True
    # direct family-to-family compatibility for defined self families
    return source_family == target_family and source_family in {"TOP", "SOP", "MAT"}


def categories_compatible(source_category: str, target_category: str) -> bool:
    return source_category == target_category or "general" in {source_category, target_category}


def build_adjacency(operators: Dict[str, Operator]) -> Dict[str, List[str]]:
    adjacency: Dict[str, List[str]] = {op_id: [] for op_id in sorted(operators)}
    ordered_ids = sorted(operators)
    for source_id in ordered_ids:
        source = operators[source_id]
        for target_id in ordered_ids:
            if source_id == target_id:
                continue
            target = operators[target_id]
            if families_compatible(source.family, target.family) and categories_compatible(
                source.category, target.category
            ):
                adjacency[source_id].append(target_id)
    return adjacency


def enumerate_chains(adjacency: Dict[str, List[str]], min_depth: int, max_depth: int) -> List[List[str]]:
    chains: List[List[str]] = []

    def dfs(current: str, path: List[str]) -> None:
        if min_depth <= len(path) <= max_depth:
            chains.append(path.copy())
        if len(path) == max_depth:
            return

        for nxt in adjacency[current]:
            if nxt in path:
                continue
            path.append(nxt)
            dfs(nxt, path)
            path.pop()

    for start in sorted(adjacency):
        dfs(start, [start])

    return chains


def guess_goal(chain_ops: Iterable[Operator]) -> str:
    categories = [op.category for op in chain_ops if op.category]
    if categories:
        return f"build a {categories[0].replace('_', ' ')} workflow"
    return "build a TouchDesigner workflow"


def recipe_id_from_chain(chain_ops: List[Operator]) -> str:
    return "recipe_" + "_".join(op.op_id for op in chain_ops) + "_sequence"


def build_workflow_steps(chain_ops: List[Operator]) -> List[str]:
    steps = [f"Start with {chain_ops[0].operator_name}"]
    for prev, curr in zip(chain_ops, chain_ops[1:]):
        steps.append(f"Connect {prev.operator_name} output to {curr.operator_name}")
    tail_params = list(chain_ops[-1].parameters)
    if tail_params:
        steps.append(
            f"Adjust {chain_ops[-1].operator_name} parameters: {', '.join(tail_params)}"
        )
    return steps


def build_recipe(chain_ids: List[str], operators: Dict[str, Operator]) -> dict:
    chain_ops = [operators[op_id] for op_id in chain_ids]
    key_parameters = {
        op.operator_name: list(op.parameters)
        for op in chain_ops
        if op.parameters
    }

    return {
        "recipe_id": recipe_id_from_chain(chain_ops),
        "goal": guess_goal(chain_ops),
        "operators": [op.operator_name for op in chain_ops],
        "workflow_steps": build_workflow_steps(chain_ops),
        "key_parameters": key_parameters,
    }


def build_use_case(recipe: dict) -> dict:
    suffix = recipe["recipe_id"].replace("recipe_", "")
    return {
        "use_case_id": f"usecase_{suffix}",
        "goal": recipe["goal"],
        "operators": recipe["operators"],
        "related_recipe": recipe["recipe_id"],
    }


def question_variants(use_case: dict) -> List[str]:
    goal = use_case["goal"]
    operators = use_case["operators"]
    joined_ops = " -> ".join(operators)
    last_op = operators[-1]

    variants = [
        f"how do i {goal}",
        f"{goal} in touchdesigner",
        f"workflow for {goal}",
        f"build {goal} with {' and '.join(operators[:2])}",
        f"operator chain for {goal}",
        f"how to connect {joined_ops}",
        f"best way to set up {last_op}",
    ]

    if len(operators) >= 3:
        variants.extend(
            [
                f"multi-step setup for {goal}",
                f"how to patch {' to '.join(operators[:3])}",
                f"touchdesigner {'/'.join(operators[:3])} example",
            ]
        )

    # Keep deterministic count in 5-12 range.
    return variants[:12]


def generate_libraries(operators: Dict[str, Operator], adjacency: Dict[str, List[str]]) -> Tuple[List[dict], List[dict], List[dict]]:
    chains = enumerate_chains(adjacency, MIN_DEPTH, MAX_DEPTH)

    recipe_ids_seen: Set[str] = set()
    question_seen: Set[str] = set()

    recipes: List[dict] = []
    use_cases: List[dict] = []
    questions: List[dict] = []

    for chain in chains:
        recipe = build_recipe(chain, operators)
        recipe_id = recipe["recipe_id"]
        if recipe_id in recipe_ids_seen:
            continue
        recipe_ids_seen.add(recipe_id)
        recipes.append(recipe)

        use_case = build_use_case(recipe)
        use_cases.append(use_case)

        for question in question_variants(use_case):
            normalized = question.strip().lower()
            if normalized in question_seen:
                continue
            question_seen.add(normalized)
            questions.append({"question": question, "use_case": use_case["use_case_id"]})

    recipes.sort(key=lambda item: item["recipe_id"])
    use_cases.sort(key=lambda item: item["use_case_id"])
    questions.sort(key=lambda item: (item["use_case"], item["question"]))

    return recipes, use_cases, questions


def write_json(path: Path, payload: List[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")


def parse_args() -> argparse.Namespace:
    default_input, default_output = resolve_default_paths()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=default_input, help="Operator JSON directory")
    parser.add_argument("--output", type=Path, default=default_output, help="Generated JSON output directory")
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    operators = load_operator_files(args.input)
    adjacency = build_adjacency(operators)
    recipes, use_cases, questions = generate_libraries(operators, adjacency)

    write_json(args.output / "recipes_generated.json", recipes)
    write_json(args.output / "use_cases_generated.json", use_cases)
    write_json(args.output / "questions_generated.json", questions)

    print("Generated:")
    print(f"{len(recipes)} recipes")
    print(f"{len(use_cases)} use cases")
    print(f"{len(questions)} questions")


if __name__ == "__main__":
    main()
