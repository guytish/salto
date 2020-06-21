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
import * as nodemailer from 'nodemailer'
import { DetailedChange } from '@salto-io/core'
import { Trigger } from './trigger'


const log = console

type NotificationType = string
export const EmailNotificationType: NotificationType = 'email'

export type SMTPConfig = {
  host: string
  port: number
  ssl: boolean
  username: string
  password: string
}

const smtpProtocol = (ssl: boolean): string => `smtp${ssl ? 's' : ''}`
const smtpConnectionString = (smtp: SMTPConfig): string =>
  `${smtpProtocol(smtp.ssl)}://${smtp.username}:${smtp?.password}@${smtp.host}:${smtp.port}`

export type NotificationConfig = {
  type: NotificationType
  subject: string
  from: string
  to: string[]
  triggers: string[]
}

export class Notification {
  type: NotificationType
  subject: string
  from: string
  to: string[]
  triggerNames: string[]

  constructor(notificationConfig: NotificationConfig) {
    this.type = notificationConfig.type
    this.subject = notificationConfig.subject
    this.from = notificationConfig.from
    this.to = notificationConfig.to
    this.triggerNames = notificationConfig.triggers
  }
}

const templateHTMLBody = (trigger: Trigger): string =>
  trigger.triggeredBy.map((change: DetailedChange) => change.id.getFullName()).join('\n')

const notifyByEmail = async (
  notification: Notification,
  trigger: Trigger,
  smtpConfig: SMTPConfig,
  attachment?: string):
  Promise<boolean> => {
  const transporter = nodemailer.createTransport(smtpConnectionString(smtpConfig))
  const mailOptions = {
    from: notification.from,
    to: notification.to,
    subject: notification.subject,
    text: templateHTMLBody(trigger),
    attachments: [
      {
        filename: 'diff.html',
        content: attachment,
        contentType: 'text/html',
      },
    ],
  }
  try {
    await transporter.sendMail(mailOptions)
  } catch (e) {
    log.error(`Failed to send email to ${notification.to}`)
    return false
  }
  return true
}

export const notify = async (
  notification: Notification,
  trigger: Trigger,
  attachment?: string,
  smtpConfig?: SMTPConfig):
  Promise<boolean> => {
  if (notification.type === EmailNotificationType && smtpConfig) {
    return notifyByEmail(notification, trigger, smtpConfig, attachment)
  }
  return false
}