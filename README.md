# Rolling Admissions MDP Project

## Overview

This is part of an operations research project surrounding MBA Admissions. The goal is to find an optimal policy for admitting students on a rolling basis. This codebase includes a Svelte/TypeScript simulation of the admissions cycle.

## Project Structure

- `main.tex`: LaTeX file for the model (that the simulation is based on)
- `main.pdf`: Rendered PDF of `main.tex`
- `simulation/`: Directory containing the simulation code
  - `lib/simulation/`: Directory containing main simulation code and logic
  - `routes/`: Frontend code for the simulation UI

## Usage

The project is deployed at https://yikuansun.github.io/rolling-admissions-mdp/. To run the simulation locally, run `npm run dev` in the `simulation/` directory.