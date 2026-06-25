# Rolling Admissions MDP Project

## Overview

This is part of an operations research project surrounding MBA Admissions. The goal is to find an optimal policy for admitting students on a rolling basis. This codebase includes a Svelte/TypeScript simulation of the admissions cycle.

## Project Structure

```
simulation/
├── src/                          Source code
│   ├── lib/                      Shared code
│   │   └── simulation/           Main simulation code
│   │       ├── csv-import.ts     CSV helper functions
│   │       ├── defaults.ts       Populate default parameters
│   │       ├── engine.ts         Main simulation engine
│   │       ├── export.ts         Export to CSV
│   │       ├── optimizer.ts      Genetic algorithm engine
│   │       ├── serialization.ts  Serialize/deserialize model parameters (for web workers, used by optimizer)
│   │       ├── policy.ts         Convert policy definition into function
│   │       └── tensor.ts         Class definitions for tensors (using typed arrays for performance)
│   └── routes/                   Frontend code
└── package.json                  Node.js dependencies

main.tex                          Paper
```

## Usage

The project is deployed at https://yikuansun.github.io/rolling-admissions-mdp/. To run the simulation locally, run `npm run dev` in the `simulation/` directory.