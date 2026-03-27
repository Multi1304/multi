import React, { useState, useEffect } from 'react';
import { 
  Box, 
  Button, 
  Card, 
  CardContent, 
  Typography, 
  Grid, 
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  TextField,
  MenuItem,
  CircularProgress
} from '@mui/material';
import { Add, Launch, Edit, Delete, Security } from '@mui/icons-material';
import axios from 'axios';
import { resolveApiBaseUrl } from '../../api/runtime';

export const ProfilesManager = () => {
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [newProfile, setNewProfile] = useState({ 
    name: '', 
    templateId: 'tpl-2026-win-chrome',
    productionMode: true 
  });

  const templates = [
    { id: 'tpl-2026-win-chrome', name: 'Windows Chrome 2026 (USA)' },
    { id: 'tpl-2026-mac-safari', name: 'macOS Safari 2026 (EU)' },
    { id: 'tpl-2026-mobile-android', name: 'Android Mobile 2026 (LATAM)' }
  ];

  const fetchProfiles = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const apiBase = await resolveApiBaseUrl();
      const res = await axios.get(`${apiBase}/profiles`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setProfiles(res.data);
    } catch (err) {
      console.error('Error fetching profiles', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfiles();
  }, []);

  const handleLaunch = async (id) => {
    try {
      const token = localStorage.getItem('token');
      const apiBase = await resolveApiBaseUrl();
      await axios.post(`${apiBase}/profiles/${id}/launch`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch (err) {
      alert('Error launching profile: ' + err.message);
    }
  };

  const handleCreate = async () => {
    try {
      const token = localStorage.getItem('token');
      const apiBase = await resolveApiBaseUrl();
      await axios.post(`${apiBase}/profiles`, newProfile, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setOpen(false);
      fetchProfiles();
    } catch (err) {
      console.error(err);
      alert('Error creating profile');
    }
  };

  return (
    <Box sx={{ p: 4, bgcolor: '#f5f7fa', minHeight: '100vh' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 4 }}>
        <Typography variant="h4" fontWeight="bold">
          Superior V3 Profiles Manager
        </Typography>
        <Button 
          variant="contained" 
          startIcon={<Add />} 
          onClick={() => setOpen(true)}
          sx={{ borderRadius: 2, px: 3 }}
        >
          New Profile
        </Button>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 10 }}>
          <CircularProgress />
        </Box>
      ) : (
        <Grid container spacing={3}>
          {profiles.map((profile) => (
            <Grid item xs={12} md={6} lg={4} key={profile.id}>
              <Card sx={{ borderRadius: 3, boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                    <Typography variant="h6" fontWeight="bold">
                      {profile.name}
                    </Typography>
                    <Security color="primary" sx={{ fontSize: 20 }} />
                  </Box>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    Template: {profile.templateId}
                  </Typography>
                  <Box sx={{ mt: 3, display: 'flex', gap: 1 }}>
                    <Button 
                      fullWidth 
                      variant="outlined" 
                      startIcon={<Launch />} 
                      onClick={() => handleLaunch(profile.id)}
                    >
                      Launch
                    </Button>
                    <IconButton size="small"><Edit /></IconButton>
                    <IconButton size="small" color="error"><Delete /></IconButton>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Create V3 Superior Profile</DialogTitle>
        <DialogContent sx={{ mt: 1 }}>
          <TextField
            fullWidth
            label="Profile Name"
            margin="normal"
            value={newProfile.name}
            onChange={(e) => setNewProfile({ ...newProfile, name: e.target.value })}
          />
          <TextField
            fullWidth
            select
            label="Select Template"
            margin="normal"
            value={newProfile.templateId}
            onChange={(e) => setNewProfile({ ...newProfile, templateId: e.target.value })}
          >
            {templates.map((tpl) => (
              <MenuItem key={tpl.id} value={tpl.id}>
                {tpl.name}
              </MenuItem>
            ))}
          </TextField>
          <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
            <input 
              type="checkbox" 
              checked={newProfile.productionMode !== false} 
              onChange={(e) => setNewProfile({ ...newProfile, productionMode: e.target.checked })}
              id="prod-mode-toggle"
            />
            <Typography variant="body2" component="label" htmlFor="prod-mode-toggle" sx={{ cursor: 'pointer', fontWeight: 'bold' }}>
              Production Mode (Secure Runtime + Anti-Detect)
            </Typography>
          </Box>
          <Button 
            fullWidth 
            variant="contained" 
            sx={{ mt: 3, py: 1.5, borderRadius: 2 }}
            onClick={handleCreate}
          >
            Generate & Save
          </Button>
        </DialogContent>
      </Dialog>
    </Box>
  );
};
