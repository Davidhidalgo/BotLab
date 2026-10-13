import {
  evaluateNumericExpression,
  evaluateWalkingCondition,
  numericExpressionNeedsDistance,
  validateNumericExpression,
  validateVariableName,
  validateWalkingCondition,
  walkingConditionRequirements,
  type CompiledCommand,
  type NumericVariables,
} from '@botlab/model';
import type {
  SimulationSession,
  SimulationCommandResult,
} from '@botlab/simulators-core';

export function programCommandNeedsDistance(command: CompiledCommand): boolean {
  if (command.commandId === 'proximity') return true;
  if (command.commandId === 'condition')
    return walkingConditionRequirements(command.inputs['condition']).distance;
  return (
    'expression' in command.inputs &&
    numericExpressionNeedsDistance(command.inputs['expression'])
  );
}

/** Program evaluation is separate from physical evidence, with one fresh sensor read per expression. */
export async function evaluateProgramCommand(
  command: CompiledCommand,
  session: SimulationSession,
  variables: NumericVariables,
  signal: AbortSignal,
): Promise<SimulationCommandResult | undefined> {
  const kind = command.commandId;
  if (
    ![
      'condition',
      'set-number',
      'change-number',
      'distance-value',
      'wait-value',
    ].includes(kind)
  )
    return undefined;
  const condition = command.inputs['condition'];
  const expression = command.inputs['expression'];
  const name = command.inputs['name'];
  if (kind === 'condition') validateWalkingCondition(condition);
  else validateNumericExpression(expression);
  if (kind === 'set-number' || kind === 'change-number')
    validateVariableName(name);
  const needs =
    kind === 'condition'
      ? walkingConditionRequirements(condition)
      : {
          distance: numericExpressionNeedsDistance(expression),
          posture: false,
        };
  signal.throwIfAborted();
  let result: SimulationCommandResult;
  if (needs.distance)
    result = await session.command(
      { kind: 'proximity', thresholdMeters: 0.3 },
      signal,
    );
  else if (needs.posture)
    result = await session.command({ kind: 'observe-posture' }, signal);
  else {
    const frame = await session.pause();
    result = {
      status: 'completed',
      evidence: 'simulator',
      level: 'program-evaluation',
      timeSeconds: frame.timeSeconds,
    };
  }
  signal.throwIfAborted();
  if (needs.posture && !result.postureObservation) {
    const observed = await session.command({ kind: 'observe-posture' }, signal);
    result.postureObservation = observed.postureObservation;
  }
  signal.throwIfAborted();
  if (kind === 'condition') {
    validateWalkingCondition(condition);
    result.decision = {
      condition,
      value: evaluateWalkingCondition(
        condition,
        result.proximity?.distanceMeters,
        result.postureObservation?.state,
        variables,
      ),
      variables: variables.snapshot(),
    };
  } else {
    validateNumericExpression(expression);
    const value = evaluateNumericExpression(
      expression,
      variables,
      result.proximity?.distanceMeters,
    );
    if (kind === 'set-number' || kind === 'change-number') {
      validateVariableName(name);
      variables.set(
        name,
        kind === 'set-number' ? value : variables.get(name) + value,
      );
      result.variableChange = { name, value: variables.get(name) };
    } else if (kind === 'distance-value') {
      if (value < 0 || value > 2000)
        throw new Error('El avance calculado debe estar entre 0 y 2000 cm.');
      const speed = Number(command.inputs['speed']);
      if (!Number.isFinite(speed) || speed <= 0 || speed > 0.3)
        throw new Error('Velocidad de avance calculado no válida.');
      return session.command(
        {
          kind: 'distance',
          distanceMeters: value / 100,
          speed,
          timeoutSeconds: 15 + value / 100 / 0.04,
        },
        signal,
      );
    } else {
      if (value < 0 || value > 30)
        throw new Error('La espera calculada debe estar entre 0 y 30 s.');
      return session.command(
        { kind: 'velocity', forward: 0, yaw: 0, durationSeconds: value },
        signal,
      );
    }
  }
  return result;
}
