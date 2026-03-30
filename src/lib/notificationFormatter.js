// Utility function to format notifications with real data
export function formatNotification(type, data) {
  const notifications = {
    // Client registration
    client_registration: (d) => ({
      titre: '👤 Nouveau client inscrit',
      message: `Nom: ${d.full_name || 'N/A'} | Téléphone: ${d.phone || 'N/A'} | Zone: ${d.location || d.quartier || 'N/A'}`,
      type: 'info',
    }),
    
    // Driver registration
    driver_registration: (d) => ({
      titre: '🛵 Nouveau livreur inscrit',
      message: `Nom: ${d.full_name || 'N/A'} | Téléphone: ${d.phone || 'N/A'} | Zone: ${d.location || d.quartier || 'N/A'} | Statut: en attente de validation`,
      type: 'info',
    }),
    
    // Partner registration
    partner_registration: (d) => ({
      titre: '🏪 Nouveau partenaire inscrit',
      message: `Commerce: ${d.business_name || d.nom_commerce || 'N/A'} | Catégorie: ${d.category || d.type_commerce || 'N/A'} | Téléphone: ${d.phone || 'N/A'} | Zone: ${d.location || d.quartier || 'N/A'}`,
      type: 'info',
    }),
    
    // Commercial registration
    commercial_registration: (d) => ({
      titre: '📣 Nouveau commercial inscrit',
      message: `Nom: ${d.full_name || 'N/A'} | Téléphone: ${d.phone || 'N/A'} | Zone: ${d.location || d.quartier || 'N/A'}`,
      type: 'info',
    }),
    
    // New delivery
    delivery_created: (d) => ({
      titre: '📦 Nouvelle course',
      message: `Départ: ${d.pickup_zone || d.quartier_depart || 'N/A'} | Arrivée: ${d.dropoff_zone || d.quartier_arrivee || 'N/A'} | Prix: ${d.price || d.prix || 'N/A'} FCFA | Client: ${d.client_name || d.client_email || 'N/A'}`,
      type: 'success',
    }),
    
    // Delivery accepted
    delivery_accepted: (d) => ({
      titre: '✅ Course acceptée',
      message: `Livreur: ${d.driver_name || d.livreur_name || 'N/A'} | Téléphone: ${d.driver_phone || d.telephone_livreur || 'N/A'} | Course: ${d.route || d.id?.substring(0, 8) || 'N/A'}`,
      type: 'success',
    }),
    
    // Delivery completed
    delivery_completed: (d) => ({
      titre: '🎉 Course terminée',
      message: `Course: ${d.route || d.id?.substring(0, 8) || 'N/A'} | Montant: ${d.price || d.prix || 'N/A'} FCFA | Livreur: ${d.driver_name || d.livreur_name || 'N/A'}`,
      type: 'success',
    }),
    
    // Account approved
    account_approved: (d) => ({
      titre: '✅ Compte validé',
      message: `Votre compte ${d.role || d.profile_type || 'utilisateur'} a été validé avec succès.`,
      type: 'success',
    }),
    
    // Account rejected
    account_rejected: (d) => ({
      titre: '❌ Compte refusé',
      message: `Votre compte ${d.role || d.profile_type || 'utilisateur'} n'a pas été validé. Consultez les motifs et corrigez les informations demandées.`,
      type: 'danger',
    }),
    
    // Partner blocked
    partner_blocked: (d) => ({
      titre: '🔒 Partenaire bloqué',
      message: `Le partenaire ${d.business_name || d.nom_commerce || 'N/A'} a été bloqué.`,
      type: 'danger',
    }),
    
    // Partner unblocked
    partner_unblocked: (d) => ({
      titre: '🔓 Partenaire débloqué',
      message: `Le partenaire ${d.business_name || d.nom_commerce || 'N/A'} a été débloqué.`,
      type: 'success',
    }),
    
    // Driver blocked
    driver_blocked: (d) => ({
      titre: '🔒 Livreur bloqué',
      message: `Le livreur ${d.driver_name || d.full_name || 'N/A'} a été bloqué.`,
      type: 'danger',
    }),
    
    // Driver unblocked
    driver_unblocked: (d) => ({
      titre: '🔓 Livreur débloqué',
      message: `Le livreur ${d.driver_name || d.full_name || 'N/A'} a été débloqué.`,
      type: 'success',
    }),
  };

  const formatter = notifications[type];
  if (!formatter) {
    return null;
  }

  return formatter(data);
}

// Check if notification should be created (has required data)
export function shouldCreateNotification(type, data) {
  const requirementMap = {
    client_registration: ['full_name', 'phone'],
    driver_registration: ['full_name', 'phone'],
    partner_registration: ['business_name', 'phone'],
    commercial_registration: ['full_name', 'phone'],
    delivery_created: ['pickup_zone', 'dropoff_zone', 'price'],
    delivery_accepted: ['driver_name', 'route'],
    delivery_completed: ['route', 'price', 'driver_name'],
    account_approved: ['role'],
    account_rejected: ['role'],
    partner_blocked: ['business_name'],
    partner_unblocked: ['business_name'],
    driver_blocked: ['driver_name'],
    driver_unblocked: ['driver_name'],
  };

  const required = requirementMap[type] || [];
  return required.every(field => data[field] && data[field] !== '');
}