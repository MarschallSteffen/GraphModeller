import type { ElementConfig } from './ElementConfig.ts'
import { umlClassConfig, umlPackageConfig } from './elements/umlClass.ts'
import { storageConfig } from './elements/storage.ts'
import { agentConfig, humanAgentConfig } from './elements/actor.ts'
import { queueConfig } from './elements/queue.ts'
import { useCaseConfig, ucSystemConfig, ucActorConfig } from './elements/useCase.ts'
import { stateConfig, startStateConfig, endStateConfig } from './elements/stateDiagram.ts'
import { seqLifelineConfig, seqFragmentConfig } from './elements/sequenceDiagram.ts'
import { commentConfig } from './elements/comment.ts'

const registry = new Map<string, ElementConfig>()

function register(config: ElementConfig) {
  registry.set(config.type, config)
}

register(umlClassConfig)
register(umlPackageConfig)
register(storageConfig)
register(agentConfig)
register(humanAgentConfig)
register(queueConfig)
register(useCaseConfig)
register(ucSystemConfig)
register(ucActorConfig)
register(stateConfig)
register(startStateConfig)
register(endStateConfig)
register(seqLifelineConfig)
register(seqFragmentConfig)
register(commentConfig)

export function getElementConfig(type: string): ElementConfig | undefined {
  return registry.get(type)
}

export function getAllElementConfigs(): ElementConfig[] {
  return Array.from(registry.values())
}
