import {
  AcceptCommand,
  CancelCommand,
  ChangePinCommand,
  Commands,
  EnterCanCommand,
  EnterPinCommand,
  EnterPukCommand,
  GetCertificateCommand,
  GetInfoCommand,
  Handler,
  HandlerDefinition,
  InitCommand,
  RunAuthCommand,
  SetAccessRightsCommand,
  SetNewPinCommand,
} from './commandTypes'
import {
  AccessRightsMessage,
  AuthMessage,
  BadStateMessage,
  CertificateMessage,
  ChangePinMessage,
  EnterCanMessage,
  EnterNewPinMessage,
  EnterPinMessage,
  EnterPukMessage,
  InfoMessage,
  InitMessage,
  InsertCardMessage,
  Messages,
  ReaderMessage,
} from './messageTypes'
import { AccessRightsFields, CardError, ScannerConfig } from './types'

export const insertCardHandler: HandlerDefinition<InsertCardMessage> = {
  canHandle: [Messages.insertCard],
  handle: (_, { handleCardRequest }, __) => {
    return handleCardRequest && handleCardRequest()
  },
}

export const readerHandler: HandlerDefinition<ReaderMessage> = {
  canHandle: [Messages.reader],
  handle: (msg, { handleCardInfo }, __) => {
    return handleCardInfo && handleCardInfo(msg.card)
  },
}

export const badStateHandler: HandlerDefinition<BadStateMessage> = {
  canHandle: [Messages.badState],
  handle: (message, _, { reject }) => {
    return reject(message.error)
  },
}

export const initSdkCmd = (
  callback: Handler<InitMessage>,
): InitCommand<InitMessage> => ({
  command: { cmd: Commands.init },

  handler: {
    canHandle: [Messages.init],
    handle: callback,
  },
})

export const getInfoCmd = (): GetInfoCommand<InfoMessage> => {
  return {
    command: { cmd: Commands.getInfo },
    handler: {
      canHandle: [Messages.info],
      handle: (message, _, { resolve }) => resolve(message),
    },
  }
}

export const runAuthCmd = (
  tcTokenURL: string,
  config?: ScannerConfig,
): RunAuthCommand<AccessRightsMessage, AccessRightsMessage | AuthMessage> => {
  return {
    command: {
      cmd: Commands.runAuth,
      tcTokenURL,
      handleInterrupt: true,
      messages: {
        sessionStarted:
          config?.sessionStarted ??
          "Please place your ID card on the top of the device's back side.",
        sessionFailed: config?.sessionFailed ?? 'Scanning process failed.',
        sessionSucceeded:
          config?.sessionSucceeded ??
          'Scanning process has been finished successfully.',
        sessionInProgress:
          config?.sessionInProgress ?? 'Scanning process is in progress.',
      },
    },
    handler: {
      canHandle: [Messages.accessRights, Messages.auth],
      handle: (message, _, { resolve, reject }) => {
        switch (message.msg) {
          case Messages.auth:
            if (message?.result?.message) {
              return reject(message.result)
            }
            return
          case Messages.accessRights:
            return resolve(message)
          default:
            return reject(new Error('Unknown message type'))
        }
      },
    },
  }
}

export const changePinCmd = (
  config?: ScannerConfig,
): ChangePinCommand<
  ChangePinMessage,
  EnterPinMessage | EnterPukMessage | EnterCanMessage | ChangePinMessage
> => {
  return {
    command: {
      cmd: Commands.runChangePin,
      handleInterrupt: true,
      messages: {
        sessionStarted:
          config?.sessionStarted ??
          "Please place your ID card on the top of the device's back side.",
        sessionFailed: config?.sessionFailed ?? 'Scanning process failed.',
        sessionSucceeded:
          config?.sessionSucceeded ??
          'Scanning process has been finished successfully.',
        sessionInProgress:
          config?.sessionInProgress ?? 'Scanning process is in progress.',
      },
    },
    handler: {
      canHandle: [
        Messages.enterPin,
        Messages.enterPuk,
        Messages.enterCan,
        Messages.changePin,
      ],
      handle: (
        message,
        {
          handlePinRequest,
          handlePukRequest,
          handleCanRequest,
          handleChangePinCancel,
        },
        { resolve, reject },
      ) => {
        switch (message.msg) {
          case Messages.enterPin:
            handlePinRequest && handlePinRequest(message.reader.card)
            return resolve(message)
          case Messages.enterPuk:
            handlePukRequest && handlePukRequest(message.reader.card)
            return resolve(message)
          case Messages.enterCan:
            handleCanRequest && handleCanRequest(message.reader.card)
            return resolve(message)
          case Messages.changePin:
            if (message.success === false) {
              handleChangePinCancel && handleChangePinCancel()
              return resolve(message)
            }
            return
          default:
            return reject(new Error('Unknown message type'))
        }
      },
    },
  }
}

export const enterPukCmd = (
  puk: string,
): EnterPukCommand<
  EnterPinMessage | EnterPukMessage,
  EnterPinMessage | EnterPukMessage | ChangePinMessage | AuthMessage
> => {
  return {
    command: {
      cmd: Commands.setPuk,
      value: puk,
    },
    handler: {
      canHandle: [
        Messages.enterPin,
        Messages.enterPuk,
        Messages.changePin,
        Messages.auth,
      ],
      handle: (message, eventHandlers, { reject, resolve }) => {
        const { handlePukRequest, handlePinRequest } = eventHandlers
        switch (message.msg) {
          /**
           * NOTE:
           * if we receive CHANGE_PIN or AUTH as a response to SET_PUK
           * cmd, this indicates that the card is blocked, therefore, we are
           * rejecting.
           */
          case Messages.auth:
            return reject(CardError.cardIsBlocked)
          case Messages.changePin:
            if (message.success === false) {
              return reject(CardError.cardIsBlocked)
            }
            return
          case Messages.enterPin:
            handlePinRequest && handlePinRequest(message.reader.card)
            return resolve(message)
          case Messages.enterPuk:
            handlePukRequest && handlePukRequest(message.reader.card)
            return resolve(message)
          default:
            return reject(new Error('Unknown message type'))
        }
      },
    },
  }
}

export const enterCanCmd = (
  can: string,
): EnterCanCommand<
  EnterCanMessage,
  EnterPinMessage | EnterCanMessage | ChangePinMessage | AuthMessage
> => {
  return {
    command: {
      cmd: Commands.setCan,
      value: can,
    },
    handler: {
      canHandle: [
        Messages.enterPin,
        Messages.enterCan,
        Messages.changePin,
        Messages.auth,
      ],
      handle: (message, eventHandlers, { resolve, reject }) => {
        const {
          handleCanRequest,
          handlePinRequest,
          handleChangePinCancel,
          handleAuthFailed,
          handleAuthSuccess,
        } = eventHandlers

        switch (message.msg) {
          case Messages.changePin:
            if (message.success === false) {
              handleChangePinCancel && handleChangePinCancel()
              return resolve(message)
            }
            return
          case Messages.auth:
            if (message.result?.message) {
              handleAuthFailed &&
                handleAuthFailed(message.url, message.result.message)
            } else {
              handleAuthSuccess && handleAuthSuccess(message.url)
            }
            return resolve(message)
          case Messages.enterPin:
            handlePinRequest && handlePinRequest(message.reader.card)
            return resolve(message)
          case Messages.enterCan:
            handleCanRequest && handleCanRequest(message.reader.card)
            return resolve(message)

          default:
            return reject(new Error('Unknown message type'))
        }
      },
    },
  }
}

export const enterPinCmd = (
  pin: string,
): EnterPinCommand<
  EnterPinMessage,
  | EnterPinMessage
  | EnterPukMessage
  | EnterCanMessage
  | AuthMessage
  | EnterNewPinMessage
  | ChangePinMessage
> => {
  return {
    command: {
      cmd: Commands.setPin,
      value: pin,
    },
    handler: {
      canHandle: [
        Messages.enterPuk,
        Messages.enterPin,
        Messages.enterCan,
        Messages.auth,
        Messages.enterNewPin,
        Messages.changePin,
      ],
      handle: (message, eventHandlers, { resolve, reject }) => {
        const {
          handleCanRequest,
          handlePinRequest,
          handlePukRequest,
          handleEnterNewPin,
          handleChangePinCancel,
          handleAuthFailed,
          handleAuthSuccess,
        } = eventHandlers

        switch (message.msg) {
          case Messages.changePin:
            if (message.success === false) {
              handleChangePinCancel && handleChangePinCancel()
              return resolve(message)
            }
            return
          case Messages.enterNewPin:
            handleEnterNewPin && handleEnterNewPin()
            return resolve(message)
          case Messages.auth:
            if (message.result?.message) {
              handleAuthFailed &&
                handleAuthFailed(message.url, message.result.message)
            } else {
              handleAuthSuccess && handleAuthSuccess(message.url)
            }
            return resolve(message)

          case Messages.enterPin:
            handlePinRequest && handlePinRequest(message.reader?.card)
            return resolve(message)
          case Messages.enterPuk:
            handlePukRequest && handlePukRequest(message.reader?.card)
            return resolve(message)
          case Messages.enterCan:
            handleCanRequest && handleCanRequest(message.reader?.card)
            return resolve(message)
          default:
            return reject(new Error('Unknown message type'))
        }
      },
    },
  }
}

export const acceptAuthReqCmd = (): AcceptCommand<
  AuthMessage,
  EnterPinMessage | EnterPukMessage | EnterCanMessage | AuthMessage
> => {
  return {
    command: {
      cmd: Commands.accept,
    },
    handler: {
      canHandle: [
        Messages.enterPin,
        Messages.enterCan,
        Messages.enterPuk,
        Messages.auth,
      ],
      handle: (
        message,
        {
          handlePinRequest,
          handlePukRequest,
          handleCanRequest,
          handleAuthFailed,
          handleAuthSuccess,
        },
        { resolve, reject },
      ) => {
        switch (message.msg) {
          case Messages.enterPin:
            handlePinRequest && handlePinRequest(message.reader.card)
            return resolve(message)
          case Messages.enterPuk:
            handlePukRequest && handlePukRequest(message.reader.card)
            return resolve(message)
          case Messages.enterCan:
            handleCanRequest && handleCanRequest(message.reader.card)
            return resolve(message)

          case Messages.auth:
            if (message.result?.message) {
              handleAuthFailed &&
                handleAuthFailed(message.url, message.result.message)
            }
            return resolve(message)
          default:
            return reject(new Error('Unknown message type'))
        }
      },
    },
  }
}

export const getCertificate = (): GetCertificateCommand<CertificateMessage> => {
  return {
    command: { cmd: Commands.getCertificate },
    handler: {
      canHandle: [Messages.certificate],
      handle: (message, _, { resolve }) => resolve(message),
    },
  }
}

export const cancelFlow = (): CancelCommand<
  AuthMessage,
  AuthMessage | ChangePinMessage
> => {
  return {
    command: { cmd: Commands.cancel },
    handler: {
      canHandle: [Messages.auth, Messages.changePin],
      handle: (
        message,
        { handleChangePinCancel, handleAuthFailed, handleAuthSuccess },
        { resolve, reject },
      ) => {
        /**
         * NOTE: we are resolving all the messages here, because when
         * user sends CANCEL cmd these msgs indicate the end of a flow;
         * this is not an erroneous state
         */
        switch (message.msg) {
          case Messages.auth:
            if (message.result?.message) {
              handleAuthFailed &&
                handleAuthFailed(message.url, message.result.message)
            }
            return resolve(message)
          case Messages.changePin:
            if (message.success === false) {
              handleChangePinCancel && handleChangePinCancel()
              return resolve(message)
            }
            return
          default:
            return reject(new Error('Unknown message type'))
        }
      },
    },
  }
}

export const setAccessRights = (
  optionalFields: Array<AccessRightsFields>,
): SetAccessRightsCommand<AccessRightsMessage> => {
  return {
    command: { cmd: Commands.setAccessRights, chat: optionalFields },
    handler: {
      canHandle: [Messages.accessRights],
      handle: (message, _, { resolve, reject }) => {
        switch (message.msg) {
          case Messages.accessRights:
            return resolve(message)
          default:
            return reject(new Error('Unknown message type'))
        }
      },
    },
  }
}

export const setNewPin = (
  pin: string,
): SetNewPinCommand<ChangePinMessage, ChangePinMessage> => {
  return {
    command: { cmd: Commands.setNewPin, value: pin },
    handler: {
      canHandle: [Messages.changePin],
      handle: (message, eventHandlers, { resolve }) => {
        const { handleChangePinSuccess, handleChangePinCancel } = eventHandlers
        if (message.success === true) {
          handleChangePinSuccess && handleChangePinSuccess()
          return resolve(message)
        } else if (message.success === false) {
          handleChangePinCancel && handleChangePinCancel()
          return resolve(message)
        }
      },
    },
  }
}
