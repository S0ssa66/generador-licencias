import { serveSriArtifact } from '../_sri_download.js';

export default function handler(req, res) {
    return serveSriArtifact(req, res, 'xml');
}
