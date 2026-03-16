# Product Overview

`pea` stands for `Product Engineer Agents`.

It is the stakeholder simulation service used by the Epic Systems Engineering
Judgment Workshop.

## Purpose

The workshop is designed to help software engineers build stronger engineering
judgment in a world where AI increasingly handles implementation work.

The core thesis is:

As AI systems generate and modify production code, the scarce engineering skill
becomes judgment, not implementation.

The workshop trains engineers to:

- define problems precisely
- surface hidden constraints
- articulate tradeoffs before building
- protect user experience
- critique proposals and implementations
- detect silent regressions
- define evaluation and rollback criteria

The goal is to help software developers become product engineers.

## What Pea Does

`pea` simulates stakeholders in workshop exercises so participants can practice
requirement discovery under ambiguity.

Those simulated stakeholders may represent:

- product managers
- executives
- support teams
- operations teams
- users
- regulators
- other engineers

The value of `pea` is not that it gives participants answers. The value is that
it creates the same kind of friction participants encounter in real
organizations.

## Relationship To The Workshop App

`pea` is not the full workshop platform.

The workshop application handles the learner experience, facilitation flow, and
exercise structure. `pea` is the service that powers the agent side of those
interactions.

In practice, that means `pea` is expected to own:

- stakeholder conversation behavior
- scenario and prompt configuration
- instructor/admin controls for adjusting agents
- service interfaces the workshop app can embed or call

## What The Project Is Not

This project is not:

- a prompt engineering workshop
- an AI workflow tutorial
- a coding course
- a framework training exercise

It is a practice environment for developing judgment through critique.

## Core Exercise Loop

The typical workshop loop looks like this:

1. An ambiguous scenario is presented.
2. Participants ask clarification questions.
3. Participants produce a problem definition, constraints, assumptions, success
   criteria, risks, and a plan.
4. An implementation or prepared solution is revealed.
5. The group critiques the result.
6. The group analyzes where intent and outcome diverged.
7. The group extracts heuristics for better judgment next time.

Learning comes from repeated critique cycles, not from lecture-heavy content.

## What The Agents Must Simulate

Stakeholder simulations should reflect realistic organizational behavior:

- incomplete understanding of the real problem
- conflicting incentives across functions
- hidden constraints that only emerge through questioning
- vague success criteria that must be made measurable
- risk blind spots around rollout, monitoring, and rollback

Agents should not volunteer everything up front. Participants must discover what
matters by asking better questions.

## Behavioral Principles

Stakeholder agents should generally:

- answer only what was asked
- reveal information progressively
- use natural stakeholder language
- avoid unnecessary technical precision
- sometimes contradict themselves
- have incomplete knowledge
- occasionally introduce late-breaking constraints

The simulation should feel realistic enough that good outcomes depend on strong
judgment, not lucky guesses.

## Participant Outputs

Exercises should push participants toward producing:

- a clear problem definition
- explicit constraints
- named assumptions
- measurable success criteria
- a risk model
- a rollout, monitoring, and rollback approach

The shared workshop vocabulary includes terms such as `constraint`,
`assumption`, `invariant`, `tradeoff`, `risk surface`, `rollback boundary`, and
`degradation signal`. `pea` should create situations that make this vocabulary
useful.

## Success Lens

`pea` succeeds when it reliably creates realistic ambiguity that forces learners
to think like product engineers:

- clarify before building
- test assumptions
- identify risk before failure
- critique outcomes rather than admire implementation speed
