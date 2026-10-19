import { CHANNEL_ID } from './config.mjs';
import { CollectorError } from './errors.mjs';

export async function resolveChannel(client, config) {
  const query = config.channelId ? { id: config.channelId } : { forHandle: config.handle };
  const response = await client.list('channels', { part: 'snippet,contentDetails', ...query });
  if (response.items.length === 0) throw new CollectorError('CHANNEL_NOT_FOUND');
  if (response.items.length !== 1) throw new CollectorError('IDENTITY_MISMATCH');
  const channel = response.items[0];
  if (!CHANNEL_ID.test(channel?.id) || (config.channelId && channel.id !== config.channelId)) {
    throw new CollectorError('IDENTITY_MISMATCH');
  }
  if (config.handle) {
    // Resolve the handle through the supported filter as well when an ID is pinned.
    const handleResult = config.channelId
      ? await client.list('channels', { part: 'id', forHandle: config.handle }) : response;
    if (handleResult.items.length !== 1 || handleResult.items[0]?.id !== channel.id) {
      throw new CollectorError('IDENTITY_MISMATCH');
    }
  }
  const uploadsPlaylistId = channel.contentDetails?.relatedPlaylists?.uploads;
  if (typeof channel.snippet?.title !== 'string' || !channel.snippet.title ||
      typeof uploadsPlaylistId !== 'string' || !/^[A-Za-z0-9_-]{10,100}$/u.test(uploadsPlaylistId)) {
    throw new CollectorError('INVALID_RESPONSE');
  }
  return { id: channel.id, title: channel.snippet.title, uploadsPlaylistId,
    ...(config.handle ? { handle: config.handle } : {}) };
}
