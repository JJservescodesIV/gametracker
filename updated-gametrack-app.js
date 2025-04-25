import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, Image, Modal, Pressable, TextInput, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollView } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInUp, FadeOut } from 'react-native-reanimated';
import { collection, onSnapshot, addDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from './firebase';

// RAWG API Key - replace with your own key from https://rawg.io/apidocs
const RAWG_API_KEY = '319e0719737942a99635761583fb0d8f';
const API_BASE_URL = 'https://api.rawg.io/api';

const GameCard = ({ game, onPress }) => (
  <TouchableOpacity onPress={() => onPress(game)} className="bg-gray-800 rounded-2xl m-2 p-3 w-60">
    <Image 
      source={{ uri: game.image || game.background_image || 'https://via.placeholder.com/150' }} 
      className="h-32 w-full rounded-xl" 
      resizeMode="cover"
    />
    <Text className="text-white text-lg font-semibold mt-2" numberOfLines={1}>{game.title || game.name}</Text>
    <Text className="text-gray-400 text-sm" numberOfLines={1}>{game.platform || (game.platforms && game.platforms.map(p => p.platform.name).join(', '))}</Text>
  </TouchableOpacity>
);

export default function App() {
  const [games, setGames] = useState([]);
  const [backlogGames, setBacklogGames] = useState([]);
  const [selectedGame, setSelectedGame] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);

  useEffect(() => {
    // Fetch currently playing games
    const unsubscribeCurrent = onSnapshot(collection(db, 'currentlyPlaying'), (snapshot) => {
      const gameData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setGames(gameData);
    });
    
    // Fetch backlog games
    const unsubscribeBacklog = onSnapshot(collection(db, 'backlog'), (snapshot) => {
      const gameData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setBacklogGames(gameData);
    });
    
    return () => {
      unsubscribeCurrent();
      unsubscribeBacklog();
    };
  }, []);

  const searchGames = async () => {
    if (!searchQuery.trim()) return;
    
    setIsLoading(true);
    try {
      const response = await fetch(
        `${API_BASE_URL}/games?key=${RAWG_API_KEY}&search=${encodeURIComponent(searchQuery)}&page_size=10`
      );
      const data = await response.json();
      setSearchResults(data.results || []);
    } catch (error) {
      console.error('Error fetching games:', error);
      setSearchResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  const addToCollection = async (game, collection) => {
    try {
      await addDoc(collection(db, collection), {
        title: game.name,
        platform: game.platforms ? game.platforms.map(p => p.platform.name).join(', ') : 'Unknown',
        description: game.description_raw || 'No description available.',
        image: game.background_image || 'https://via.placeholder.com/150',
        rawgId: game.id,
        addedDate: new Date().toISOString(),
        rating: game.rating
      });
      
      setShowSearchModal(false);
      setSearchQuery('');
      setSearchResults([]);
    } catch (error) {
      console.error('Error adding game:', error);
    }
  };

  const removeFromCollection = async (gameId, collectionName) => {
    try {
      await deleteDoc(doc(db, collectionName, gameId));
      if (selectedGame && selectedGame.id === gameId) {
        setSelectedGame(null);
      }
    } catch (error) {
      console.error('Error removing game:', error);
    }
  };

  const moveToCurrentlyPlaying = async (game) => {
    await addToCollection(game, 'currentlyPlaying');
    if (game.id) {
      await removeFromCollection(game.id, 'backlog');
    }
    setSelectedGame(null);
  };

  const moveToBacklog = async (game) => {
    await addToCollection(game, 'backlog');
    if (game.id) {
      await removeFromCollection(game.id, 'currentlyPlaying');
    }
    setSelectedGame(null);
  };

  const fetchGameDetails = async (game) => {
    if (game.rawgId) {
      try {
        const response = await fetch(
          `${API_BASE_URL}/games/${game.rawgId}?key=${RAWG_API_KEY}`
        );
        const data = await response.json();
        setSelectedGame({
          ...game,
          description: data.description_raw || game.description,
          screenshots: data.screenshots || [],
          metacritic: data.metacritic,
          released: data.released,
        });
      } catch (error) {
        console.error('Error fetching game details:', error);
        setSelectedGame(game);
      }
    } else {
      setSelectedGame(game);
    }
  };

  return (
    <LinearGradient colors={["#1f1c2c", "#928dab"]} style={{ flex: 1 }}>
      <SafeAreaView className="px-4 pt-8 flex-1">
        <View className="flex-row justify-between items-center mb-4">
          <Text className="text-white text-3xl font-bold">GameTrack</Text>
          <TouchableOpacity onPress={() => setShowSearchModal(true)}>
            <Ionicons name="search" size={28} color="white" />
          </TouchableOpacity>
        </View>

        <Text className="text-white text-xl font-semibold mb-2">Currently Playing</Text>
        {games.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-2">
            {games.map(game => (
              <Animated.View entering={FadeInUp} exiting={FadeOut} key={game.id}>
                <GameCard game={game} onPress={fetchGameDetails} />
              </Animated.View>
            ))}
          </ScrollView>
        ) : (
          <Text className="text-gray-400 italic mb-4 ml-2">No games added yet. Search to add games.</Text>
        )}

        <Text className="text-white text-xl font-semibold mt-4 mb-2">Your Backlog</Text>
        {backlogGames.length > 0 ? (
          <FlatList
            data={backlogGames}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <Animated.View entering={FadeInUp} exiting={FadeOut}>
                <GameCard game={item} onPress={fetchGameDetails} />
              </Animated.View>
            )}
            horizontal={false}
            numColumns={2}
            showsVerticalScrollIndicator={false}
            className="flex-1"
          />
        ) : (
          <Text className="text-gray-400 italic ml-2">Your backlog is empty.</Text>
        )}
      </SafeAreaView>

      {/* Game Detail Modal */}
      <Modal
        visible={!!selectedGame}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setSelectedGame(null)}
      >
        <View className="flex-1 justify-end bg-black bg-opacity-60">
          <View className="bg-gray-900 rounded-t-3xl p-6 max-h-5/6">
            <ScrollView showsVerticalScrollIndicator={false}>
              {selectedGame && (
                <>
                  <Image 
                    source={{ uri: selectedGame.image }} 
                    className="h-48 w-full rounded-2xl mb-4" 
                    resizeMode="cover"
                  />
                  <Text className="text-white text-2xl font-bold mb-1">{selectedGame.title}</Text>
                  <Text className="text-gray-400 mb-2">{selectedGame.platform}</Text>
                  
                  {selectedGame.released && (
                    <Text className="text-gray-300 mb-1">Released: {selectedGame.released}</Text>
                  )}
                  
                  {selectedGame.metacritic && (
                    <View className="flex-row items-center mb-2">
                      <Text className="text-gray-300 mr-2">Metacritic:</Text>
                      <View className={`px-2 py-1 rounded ${selectedGame.metacritic > 75 ? 'bg-green-700' : selectedGame.metacritic > 50 ? 'bg-yellow-600' : 'bg-red-700'}`}>
                        <Text className="text-white font-bold">{selectedGame.metacritic}</Text>
                      </View>
                    </View>
                  )}
                  
                  <Text className="text-gray-300 mb-4">{selectedGame.description}</Text>
                  
                  <View className="flex-row justify-between mb-4">
                    <Pressable 
                      onPress={() => moveToCurrentlyPlaying(selectedGame)}
                      className="bg-green-600 p-3 rounded-xl flex-1 mr-2"
                    >
                      <Text className="text-white text-center">Playing</Text>
                    </Pressable>
                    <Pressable 
                      onPress={() => moveToBacklog(selectedGame)}
                      className="bg-blue-600 p-3 rounded-xl flex-1 ml-2"
                    >
                      <Text className="text-white text-center">Backlog</Text>
                    </Pressable>
                  </View>
                  
                  <Pressable 
                    onPress={() => setSelectedGame(null)} 
                    className="bg-indigo-600 p-3 rounded-xl mb-8"
                  >
                    <Text className="text-white text-center">Close</Text>
                  </Pressable>
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Search Modal */}
      <Modal
        visible={showSearchModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          setShowSearchModal(false);
          setSearchQuery('');
          setSearchResults([]);
        }}
      >
        <View className="flex-1 justify-end bg-black bg-opacity-60">
          <View className="bg-gray-900 rounded-t-3xl p-6 h-3/4">
            <Text className="text-white text-xl font-bold mb-4">Find Games</Text>
            
            <View className="flex-row mb-4">
              <TextInput
                className="bg-gray-800 text-white p-3 rounded-l-xl flex-1"
                placeholder="Search for games..."
                placeholderTextColor="#9ca3af"
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              <TouchableOpacity 
                onPress={searchGames}
                className="bg-indigo-600 px-4 justify-center rounded-r-xl"
              >
                <Ionicons name="search" size={24} color="white" />
              </TouchableOpacity>
            </View>
            
            {isLoading ? (
              <ActivityIndicator size="large" color="#6366f1" />
            ) : (
              <FlatList
                data={searchResults}
                keyExtractor={(item) => item.id.toString()}
                renderItem={({ item }) => (
                  <TouchableOpacity 
                    className="bg-gray-800 p-3 rounded-xl mb-3 flex-row"
                    onPress={() => fetchGameDetails({
                      title: item.name,
                      image: item.background_image,
                      platform: item.platforms ? item.platforms.map(p => p.platform.name).join(', ') : 'Unknown',
                      description: item.description_raw || 'No description available.',
                      rawgId: item.id,
                      rating: item.rating
                    })}
                  >
                    <Image 
                      source={{ uri: item.background_image || 'https://via.placeholder.com/150' }} 
                      className="h-16 w-16 rounded-lg mr-3" 
                      resizeMode="cover"
                    />
                    <View className="flex-1 justify-center">
                      <Text className="text-white font-semibold" numberOfLines={1}>{item.name}</Text>
                      <Text className="text-gray-400 text-sm" numberOfLines={1}>
                        {item.platforms ? item.platforms.map(p => p.platform.name).slice(0, 2).join(', ') : 'Unknown'}
                        {item.platforms && item.platforms.length > 2 ? '...' : ''}
                      </Text>
                      <View className="flex-row items-center mt-1">
                        <Ionicons name="star" size={14} color="#f59e0b" />
                        <Text className="text-gray-300 text-sm ml-1">{item.rating || 'N/A'}</Text>
                      </View>
                    </View>
                    <View className="flex-row">
                      <TouchableOpacity 
                        className="bg-green-600 px-2 py-1 rounded-lg mr-2 justify-center"
                        onPress={() => addToCollection(item, 'currentlyPlaying')}
                      >
                        <Text className="text-white text-xs">Playing</Text>
                      </TouchableOpacity>
                      <TouchableOpacity 
                        className="bg-blue-600 px-2 py-1 rounded-lg justify-center"
                        onPress={() => addToCollection(item, 'backlog')}
                      >
                        <Text className="text-white text-xs">Backlog</Text>
                      </TouchableOpacity>
                    </View>
                  </TouchableOpacity>
                )}
                showsVerticalScrollIndicator={false}
              />
            )}
            
            <Pressable 
              onPress={() => {
                setShowSearchModal(false);
                setSearchQuery('');
                setSearchResults([]);
              }} 
              className="bg-gray-700 p-3 rounded-xl mt-4"
            >
              <Text className="text-white text-center">Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </LinearGradient>
  );
}
