/*
*                      Copyright 2020 Salto Labs Ltd.
*
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with
* the License.  You may obtain a copy of the License at
*
*     http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
*/
import _ from 'lodash'
import path from 'path'
import uuidv5 from 'uuid/v5'
import { exists } from '../../file'
import { Workspace, loadWorkspace, EnviornmentsSources, initWorkspace } from '../workspace'
import { localDirectoryStore } from './dir_store'
import { getSaltoHome } from '../../app_config'
import { NaclFilesSource, FILE_EXTENSION, naclFilesSource } from '../nacl_files/nacl_files_source'
import { parseResultCache } from '../cache'
import { localState } from './state'
import { workspaceConfigSource, getConfigDir, CONFIG_DIR_NAME } from './workspace_config'
import { configSource, ConfigSource } from '../config_source'

export const COMMON_ENV_PREFIX = ''
export const ENVS_PREFIX = 'envs'
export const STATES_DIR_NAME = 'states'
export const CREDENTIALS_CONFIG_PATH = 'credentials'

export class NotAnEmptyWorkspaceError extends Error {
  constructor(exsitingPathes: string[]) {
    super(`not an empty workspace. ${exsitingPathes.join('')} already exists.`)
  }
}

export class ExistingWorkspaceError extends Error {
  constructor() {
    super('existing salto workspace')
  }
}

export class NotAWorkspaceError extends Error {
  constructor() {
    super('not a salto workspace (or any of the parent directories)')
  }
}

const loadNaclFileSource = (
  sourceBaseDir: string,
  localStorage: string,
  excludeDirs: string[] = []
): NaclFilesSource => {
  const naclFilesStore = localDirectoryStore(
    sourceBaseDir,
    `*${FILE_EXTENSION}`,
    (dirParh: string) => !(excludeDirs.concat(getConfigDir(sourceBaseDir))).includes(dirParh),
  )
  const cacheStore = localDirectoryStore(path.join(localStorage, 'cache'))
  return naclFilesSource(naclFilesStore, parseResultCache(cacheStore))
}

const elementsSources = (baseDir: string, localStorage: string, envs: ReadonlyArray<string>):
EnviornmentsSources => ({
  commonSourceName: COMMON_ENV_PREFIX,
  sources: {
    ..._.fromPairs(envs.map(env =>
      [
        env,
        {
          naclFiles: loadNaclFileSource(
            path.resolve(baseDir, ENVS_PREFIX, env),
            path.resolve(localStorage, ENVS_PREFIX, env)
          ),
          state: localState(path.join(getConfigDir(baseDir), STATES_DIR_NAME, `${env}.jsonl`)),
        },
      ])),
    [COMMON_ENV_PREFIX]: {
      naclFiles: loadNaclFileSource(
        baseDir,
        localStorage,
        envs.map(env => path.join(baseDir, env))
      ),
    },
  },
})

const locateWorkspaceRoot = async (lookupDir: string): Promise<string|undefined> => {
  if (await exists(path.join(lookupDir, CONFIG_DIR_NAME))) {
    return lookupDir
  }
  const parentDir = lookupDir.substr(0, lookupDir.lastIndexOf(path.sep))
  return parentDir ? locateWorkspaceRoot(parentDir) : undefined
}

const credentialsSource = (localStorage: string): ConfigSource =>
  configSource(localDirectoryStore(path.join(localStorage, CREDENTIALS_CONFIG_PATH)))

export const loadLocalWorkspace = async (lookupDir: string):
Promise<Workspace> => {
  const baseDir = await locateWorkspaceRoot(path.resolve(lookupDir))
  if (_.isUndefined(baseDir)) {
    throw new NotAWorkspaceError()
  }
  const workspaceConfig = await workspaceConfigSource(baseDir)
  const credentials = credentialsSource(workspaceConfig.localStorage)
  const elemSources = elementsSources(baseDir, workspaceConfig.localStorage, workspaceConfig.envs)
  return loadWorkspace(workspaceConfig, credentials, elemSources)
}

export const initLocalWorkspace = async (baseDir: string, name?: string, envName = 'default'):
Promise<Workspace> => {
  const workspaceName = name || path.basename(path.resolve(baseDir))
  const uid = uuidv5(workspaceName, '1b671a64-40d5-491e-99b0-da01ff1f3341')
  const localStorage = path.join(getSaltoHome(), `${workspaceName}-${uid}`)
  if (await locateWorkspaceRoot(path.resolve(baseDir))) {
    throw new ExistingWorkspaceError()
  }
  if (await exists(localStorage)) {
    throw new NotAnEmptyWorkspaceError([localStorage])
  }

  const workspaceConfig = await workspaceConfigSource(baseDir, localStorage)
  const credentials = credentialsSource(localStorage)
  const elemSources = elementsSources(path.resolve(baseDir), localStorage, [envName])
  return initWorkspace(workspaceName, uid, envName, workspaceConfig, credentials, elemSources)
}