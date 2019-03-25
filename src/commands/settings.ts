import { Command } from "discord-akairo";
import { Message, TextChannel, User } from "discord.js";
import { req } from "../db";
import { logger } from "../utils";
import gql from "gql-tag/dist";

const changeWelcome = (message: Message, channel: TextChannel) => req(gql`
  mutation {
    update_guilds(
      _set: {
        welcome_channel: "${channel.id}"
        guild_id: "${channel.id}"
      }
      where: {
        guild_id: {
          _eq: "${channel.guild.id}"
        }
      }
    ) {
      returning {
        welcome_channel
      }
    }
  }
`);

const deleteWelcome = (message: Message) => req(gql`
  mutation {
    update_guilds(
      _set: {
        welcome_channel: null
      }
      where: {
        guild_id: {
          _eq: "${message.id}"
        }
      }
    ) {
      returning {
        welcome_channel
      }
    }
  }
`);

const upsertImageChannel = (channel: TextChannel, user: User) => req(gql`
  mutation {
    insert_image_channels(
      objects: [{
        channel_id: "${channel.id}"
        guild_id: "${channel.guild.id}"
        user_id: "${user.id}"
      }]
    ) {
      returning {
        channel_id
      }
    }
  }
`);

const deleteImageChannel = (channel: TextChannel) => req(gql`
  mutation {
    delete_image_channels(
      where: {
        channel_id: {
          _eq: "${channel.id}"
        }
      }
    ) {
      returning {
        id
      }
    }
  }
`);

interface Context {
  message: Message;
  args: string;
}

const settings: { [k: string]: (ctx: Context) => Promise<void> } = {
  welcome: async ({ message, args }: Context) => {
    const [value] = args;
    const targetChannel = message.mentions.channels.first();
    if (targetChannel) {
      await changeWelcome(message, targetChannel);
      await message.channel.send(`Set your welcome channel to ${targetChannel}.`);
    } else if (value === "disable") {
      await deleteWelcome(message);
      await message.channel.send(`Disabled the server welcome.`);
    }
  },
  imageBoard: async ({ message, args }: Context) => {
    const [target, status] = args.split(" ");
    const targetChannel = message.mentions.channels.first();
    if (!targetChannel) {
      return void message.channel.send(`No channel was specified`);
    }
    if (target === "remove") {
      await deleteImageChannel(targetChannel);
      await message.channel.send(`${targetChannel} was removed from your tracked image archives`);
    } else if (target === "add") {
      await upsertImageChannel(targetChannel, message.author);
      await message.channel.send(`Added ${targetChannel} to your tracked image archives`);
    } else if (!target) {
      await message.channel.send(`No setting specified`);
    }
  }
};

export default class extends Command {
  constructor() {
    super("settings", {
      aliases: ["settings"],
      userPermissions: ["BAN_MEMBERS"],
      description: "Adjusts the settings",
      args: [{
        id: "setting",
      }, {
        id: "args",
        match: "rest",
        type: "string"
      }],
    });
  }

  public async exec(message: Message, { setting, args }: any) {
    const func = settings[setting];
    if (!func) {
      message.channel.send(`'${setting}' is not a valid setting`);
    }
    try {
      await func({ message, args });
    } catch (e) {
      await message.channel.send(`Something went wrong while trying to change that setting!`);
      logger.error(e);
    }
  }
}
