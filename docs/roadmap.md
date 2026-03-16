# Roadmap

This roadmap is intentionally high-level. It describes the direction of `pea`
without locking the project into premature implementation detail.

## Guiding Direction

`pea` exists to simulate stakeholders for the Epic Systems Engineering Judgment
Workshop.

The product direction is shaped by a few consistent priorities:

- make ambiguity feel realistic
- reward strong requirement discovery instead of fast implementation
- support critique-based learning loops
- keep `pea` focused on the agent/service side of the system
- leave the learner-facing workshop experience to the separate workshop app

## Phase 1: Live Cohort Support

Near-term, `pea` should be useful in facilitated live cohorts.

That means focusing on:

- reliable stakeholder simulations for instructor-led exercises
- a small set of strong scenario archetypes
- instructor visibility and control over agent behavior
- straightforward integration with the workshop app

At this stage, realism matters more than breadth.

## Phase 2: Reusable Scenario Library

Once live exercises are working well, the next step is to make scenarios more
repeatable and reusable.

Priorities include:

- scenario definitions that can be reused across cohorts
- agent configurations that capture different stakeholder perspectives
- prompts and controls that make exercises easier to run consistently
- a clearer library of workshop-ready exercises

## Phase 3: Self-Paced Readiness

As scenarios become more stable, `pea` should support self-paced learning
experiences used by the workshop app.

This phase emphasizes:

- simulations that hold up without a facilitator in the loop
- stronger consistency in how ambiguity and constraints are revealed
- better support for critique after the conversation phase
- scenario quality that remains useful outside live delivery

## Phase 4: Studio-Grade Judgment Practice

Longer term, `pea` should support more advanced critique and judgment training.

This includes:

- richer stakeholder dynamics and conflicting incentives
- more nuanced risk and rollout conversations
- scenarios that expose silent regressions and hidden tradeoffs
- improved instructor tooling for refining and evolving simulations

## Non-Goals For Now

This roadmap does not assume `pea` becomes the full learning platform.

It is not meant to absorb:

- cohort management
- curriculum delivery
- learner progress UX
- the full workshop application experience

Those belong to the workshop app and facilitation layer, not the stakeholder
simulation service itself.

## How We Should Evaluate Progress

Progress should be judged by whether `pea` makes workshop exercises better at
teaching engineering judgment.

Signals that matter:

- participants have to ask sharper questions to succeed
- scenarios consistently surface hidden constraints and tradeoffs
- critique discussions become more concrete and rigorous
- instructors can meaningfully control and improve simulations over time
